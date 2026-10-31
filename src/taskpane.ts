// Volet du complément : onglet « Cet e-mail » (signature de l'e-mail ouvert)
// et onglet « Historique » (dernière signature de chaque expéditeur sur une période).

import { config, configure, ecritureActivee, scopesContacts, scopesHistorique } from "./config";
import { expediteurExclu, extraireFragment, fragmentColle } from "./signature";
import { comparer, construireMiseAJour, fusionner } from "./diff";
import { analyserLocalement } from "./parser";
import { analyserAvecClaude, enregistrerCle, lireCle } from "./claude";
import { construirePropositions, debutPeriode, MessageResume, PERIODES, Proposition } from "./history";
import { evaluerAlerte } from "./alerte";
import { ContactGraph, LigneComparaison, SignatureExtraite } from "./types";

type Expediteur = { name: string; email: string };

export interface Sources {
  /** null quand aucun e-mail n'est sélectionné (volet épinglé). */
  lireEmail(): Promise<{ expediteur: Expediteur; corps: string } | null>;
  /** Barre d'alerte dans l'e-mail ouvert ; null l'efface. */
  signaler(texte: string | null): void;
  /** Appelé à chaque nouvel e-mail sélectionné quand le volet est épinglé. */
  surChangement(rappel: () => void): void;
  moi(): string;
  chercher(email: string): Promise<ContactGraph[]>;
  analyser(expediteur: Expediteur, fragment: string): Promise<SignatureExtraite>;
  /** Écrit les ajouts validés : la fiche est relue juste avant, puis complétée (création si null). Renvoie ce qui n'a pas pu l'être. */
  ecrire(contact: ContactGraph | null, ajouts: Partial<ContactGraph>): Promise<string[]>;
  listerContacts(): Promise<ContactGraph[]>;
  listerMessages(depuis: string, progression: (lus: number) => void, annule: () => boolean): Promise<MessageResume[]>;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function echapper(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function initiales(e: Expediteur): string {
  const mots = (e.name || e.email).replace(/[^\p{L}\s-]/gu, " ").split(/[\s-]+/).filter(Boolean);
  return ((mots[0]?.[0] ?? "") + (mots.length > 1 ? mots[mots.length - 1][0] : "")).toUpperCase() || "?";
}

const dateCourte = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

const LIB_STATUT: Record<LigneComparaison["statut"], string> = {
  identique: "à jour",
  completer: "à compléter",
  ajouter: "à ajouter",
  conflit: "différent",
};

/** Lecture par Claude si l'utilisateur a enregistré sa clé, sinon lecture locale. */
export async function lireSignature(expediteur: Expediteur, fragment: string): Promise<SignatureExtraite> {
  const cle = lireCle();
  if (cle) {
    try {
      return { ...(await analyserAvecClaude(cle, expediteur, fragment)), methode: "claude" };
    } catch (e) {
      const local = analyserLocalement(fragment, expediteur);
      return { ...local, methode: "locale", note: `${(e as Error).message} Lecture locale utilisée. ${local.note ?? ""}`.trim() };
    }
  }
  return { ...analyserLocalement(fragment, expediteur), methode: "locale" };
}

// ——— Rendu d'une carte contact (commun aux deux onglets) ———

function rendreCarte(
  k: string,
  expediteur: Expediteur,
  lignes: LigneComparaison[],
  infos: { badge?: string; date?: string; lecture?: string },
): string {
  const aFaire = lignes.map((l, i) => ({ l, i })).filter(({ l }) => l.statut !== "identique");
  const aJour = lignes.length - aFaire.length;
  return `
  <article class="carte" data-carte="${k}">
    <div class="personne">
      <div class="initiales" aria-hidden="true">${echapper(initiales(expediteur))}</div>
      <div>
        <div class="nom">${echapper(expediteur.name || expediteur.email)}${infos.badge ? `<span class="etiquette">${echapper(infos.badge)}</span>` : ""}</div>
        <div class="adresse">${echapper(expediteur.email)}</div>
        ${infos.date ? `<div class="date">${echapper(infos.date)}</div>` : ""}
      </div>
    </div>
    ${infos.lecture ? `<p class="lecture">${echapper(infos.lecture)}</p>` : ""}
    ${aFaire
      .map(
        ({ l, i }) => `
    <div class="ligne statut-${l.statut}">
      <input type="checkbox" id="c-${k}-${i}" data-carte="${k}" data-ligne="${l.id}" ${l.cocheParDefaut ? "checked" : ""}>
      <div>
        <label class="libelle" for="c-${k}-${i}">${echapper(l.libelle)}<span class="statut">${LIB_STATUT[l.statut]}</span></label>
        ${l.actuel ? `<div class="avant">${echapper(l.actuel)}</div>` : ""}
        <input class="valeur" type="text" value="${echapper(l.propose)}" data-carte="${k}" data-index="${i}" aria-label="Nouvelle valeur pour ${echapper(l.libelle)}">
        ${l.remarque ? `<div class="remarque">${echapper(l.remarque)}</div>` : ""}
      </div>
    </div>`,
      )
      .join("")}
    ${aJour ? `<p class="a-jour">${aJour} champ${aJour > 1 ? "s" : ""} déjà à jour</p>` : ""}
  </article>`;
}

function lireSaisie(k: string, lignes: LigneComparaison[]): { lignes: LigneComparaison[]; cochees: Set<string> } {
  const modifiees = lignes.map((l, i) => {
    const champ = document.querySelector<HTMLInputElement>(`input.valeur[data-carte="${k}"][data-index="${i}"]`);
    return champ ? { ...l, propose: champ.value.trim() } : l;
  });
  const cochees = new Set(
    [...document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][data-carte="${k}"]`)]
      .filter((c) => c.checked)
      .map((c) => c.dataset.ligne!),
  );
  return { lignes: modifiees, cochees };
}

const nbCochees = (racine: HTMLElement) => racine.querySelectorAll("input[type=checkbox][data-carte]:checked").length;

// ——— Onglets et options ———

function initialiserOnglets(src: Sources) {
  let historiquePret = false;
  const choisir = (vue: "email" | "historique") => {
    $("onglet-email").setAttribute("aria-selected", String(vue === "email"));
    $("onglet-historique").setAttribute("aria-selected", String(vue === "historique"));
    $("vue-email").hidden = vue !== "email";
    $("vue-historique").hidden = vue !== "historique";
    if (vue === "historique" && !historiquePret) {
      historiquePret = true;
      initialiserHistorique(src);
    }
  };
  $("onglet-email").onclick = () => choisir("email");
  $("onglet-historique").onclick = () => choisir("historique");
  for (const n of document.querySelectorAll<HTMLElement>(".mode-test")) n.hidden = ecritureActivee;
}

function initialiserOptions() {
  const champ = $<HTMLInputElement>("cle-claude");
  const rafraichir = () => {
    const actif = Boolean(lireCle());
    $("etat-cle").textContent = actif
      ? "Lecture par Claude activée pour l'e-mail ouvert."
      : "Lecture locale : rien ne quitte Outlook.";
    $("supprimer-cle").hidden = !actif;
  };
  $("enregistrer-cle").onclick = () => {
    if (champ.value.trim()) enregistrerCle(champ.value);
    champ.value = "";
    rafraichir();
  };
  $("supprimer-cle").onclick = () => {
    enregistrerCle(null);
    rafraichir();
  };
  rafraichir();
}

// ——— Onglet « Cet e-mail » ———

let execution = 0;

/** Bandeau en tête du volet : visible quand une mise à jour est proposée. */
function bandeau(texte: string | null, nouveau = false) {
  const b = $("alerte");
  b.hidden = !texte;
  b.textContent = texte ?? "";
  b.classList.toggle("nouveau", nouveau);
}

/** Analyse de l'e-mail ouvert ; « colle » remplace la recherche automatique de la signature. */
async function vueEmail(src: Sources, colle?: string) {
  // Le volet épinglé relance l'analyse à chaque e-mail : seul le résultat de la dernière compte.
  const moi = ++execution;
  const perime = () => moi !== execution;
  const afficher = (etat: "chargement" | "message" | "resultat", texte = "") => {
    if (perime()) return;
    $("chargement").hidden = etat !== "chargement";
    $("message").hidden = etat !== "message";
    $("resultat").hidden = etat !== "resultat";
    if (etat === "message") $("message").textContent = texte;
  };
  const rien = (texte: string) => {
    if (perime()) return;
    bandeau(null);
    src.signaler(null);
    afficher("message", texte);
  };
  bandeau(null);
  afficher("chargement");
  try {
    const email = await src.lireEmail();
    const zone = $("zone-collage");
    if (colle === undefined) {
      // Nouvel e-mail : on repart de la lecture automatique.
      $<HTMLTextAreaElement>("signature-collee").value = "";
      $("effacer-collage").hidden = true;
      (zone as HTMLDetailsElement).open = false;
    }
    zone.hidden = true;
    if (!email) return rien("Sélectionnez un e-mail pour vérifier la fiche de son expéditeur.");
    const { expediteur, corps } = email;
    const exclu = expediteurExclu(expediteur.email, config.internalDomains);
    if (exclu) return rien(exclu);
    zone.hidden = false;
    const fragment = colle !== undefined ? fragmentColle(colle) : extraireFragment(corps);
    if (fragment.lignes === 0) return rien(colle !== undefined ? "Collez d'abord la signature." : "Aucun texte à analyser dans cet e-mail.");

    const [fiches, signature] = await Promise.all([src.chercher(expediteur.email), src.analyser(expediteur, fragment.texte)]);
    if (perime()) return;
    if (!signature.found) {
      return rien(colle !== undefined
        ? "Rien de reconnu dans le texte collé : vérifiez qu'il contient bien le nom ou les coordonnées de l'expéditeur."
        : "Pas de signature reconnue pour cet expéditeur. Vous pouvez la sélectionner, la copier et la coller ci-dessous.");
    }

    // Alerte visuelle : dans l'e-mail (barre Outlook) et en tête du volet.
    const alerte = evaluerAlerte(expediteur.name || expediteur.email, fiches.length > 0, signature, comparer(fiches[0] ?? null, signature, expediteur));
    src.signaler(alerte?.texte ?? null);
    bandeau(
      alerte ? (alerte.nouveau ? "Expéditeur absent de vos contacts" : `Mise à jour proposée : ${alerte.champs} champ${alerte.champs > 1 ? "s" : ""}`) : null,
      alerte?.nouveau,
    );

    let iFiche = 0;
    const rendre = () => {
      const fiche = fiches[iFiche] ?? null;
      const lignes = comparer(fiche, signature, expediteur);
      const aFaire = lignes.some((l) => l.statut !== "identique");
      const lecture = [
        colle !== undefined ? "Lu depuis la signature collée." : "",
        signature.methode === "claude" ? "Lu par Claude." : "Lu localement.",
        signature.confidence === "basse" ? "Lecture incertaine : rien n'est coché." : "",
        signature.note ?? "",
      ].filter(Boolean).join(" ");
      $("carte-email").innerHTML =
        rendreCarte("e", expediteur, lignes, {
          badge: !fiche ? "Nouveau contact" : fiches.length > 1 ? `Doublon ${iFiche + 1}/${fiches.length}` : undefined,
          lecture,
        }) +
        (fiches.length > 1 ? `<button type="button" class="lien" id="fiche-suivante">Voir l'autre fiche</button>` : "") +
        (!aFaire ? `<p class="message">La fiche est déjà à jour.</p>` : "");
      const suivante = document.getElementById("fiche-suivante");
      if (suivante) suivante.onclick = () => { iFiche = (iFiche + 1) % fiches.length; rendre(); };

      const bouton = $<HTMLButtonElement>("appliquer");
      bouton.textContent = fiche ? "Appliquer" : "Créer le contact";
      const etat = () => { bouton.disabled = !ecritureActivee || nbCochees($("carte-email")) === 0; };
      $("carte-email").onchange = etat;
      etat();
      bouton.onclick = async () => {
        const { lignes: saisies, cochees } = lireSaisie("e", lignes);
        const { ajouts, refus } = construireMiseAJour(saisies, cochees);
        if (!Object.keys(ajouts).length) {
          afficher("message", refus.length ? `Rien n'a été enregistré : ${refus.join(" ; ")}.` : "Rien à enregistrer.");
          return;
        }
        bouton.disabled = true;
        try {
          const nonEcrits = [...refus, ...(await src.ecrire(fiche, ajouts))];
          bandeau(null);
          src.signaler(null);
          afficher("message", (fiche ? "Fiche mise à jour." : "Contact créé.") + (nonEcrits.length ? ` Non enregistré : ${nonEcrits.join(" ; ")}.` : ""));
        } catch (e) {
          afficher("message", `Rien n'a été enregistré. ${(e as Error).message}`);
        }
      };
    };
    rendre();
    afficher("resultat");
  } catch (e) {
    afficher("message", `Erreur : ${(e as Error).message}`);
  }
}

// ——— Onglet « Historique » ———

function initialiserHistorique(src: Sources) {
  const periode = $<HTMLSelectElement>("periode");
  periode.innerHTML = PERIODES.map((p) => `<option value="${p.jours}" ${p.id === "1m" ? "selected" : ""}>${p.libelle}</option>`).join("");
  let annule = false;
  $("arreter").onclick = () => { annule = true; };

  const message = (texte: string) => {
    $("message-historique").textContent = texte;
    $("message-historique").hidden = !texte;
  };

  $("analyser").onclick = async () => {
    annule = false;
    message("");
    $("resultats-historique").hidden = true;
    $("formulaire-historique").hidden = true;
    $("progression").hidden = false;
    $("progression-texte").textContent = "Lecture des contacts…";
    try {
      const contacts = await src.listerContacts();
      const messages = await src.listerMessages(
        debutPeriode(Number(periode.value)),
        (lus) => { $("progression-texte").textContent = `${lus.toLocaleString("fr-FR")} e-mails lus…`; },
        () => annule,
      );
      const { propositions, expediteurs, listes } = construirePropositions(messages, contacts, {
        domainesInternes: config.internalDomains,
        moi: src.moi(),
        inclureInconnus: $<HTMLInputElement>("inclure-inconnus").checked,
      });
      afficherPropositions(src, propositions, { lus: messages.length, expediteurs, listes, interrompu: annule });
    } catch (e) {
      message(`Erreur : ${(e as Error).message}`);
    } finally {
      $("progression").hidden = true;
      $("formulaire-historique").hidden = false;
    }
  };
}

function afficherPropositions(
  src: Sources,
  propositions: Proposition[],
  stats: { lus: number; expediteurs: number; listes: number; interrompu: boolean },
) {
  const message = (texte: string) => {
    $("message-historique").textContent = texte;
    $("message-historique").hidden = !texte;
  };
  const bilan = $("bilan");
  const cartes = $("cartes");
  const appliquer = $<HTMLButtonElement>("appliquer-historique");
  const passer = $<HTMLButtonElement>("passer-historique");
  const terminer = $<HTMLButtonElement>("terminer-historique");
  const pied = appliquer.closest<HTMLElement>(".pied")!;
  const s = (n: number) => (n > 1 ? "s" : "");
  const detail =
    `${stats.lus.toLocaleString("fr-FR")} e-mails lus, ${stats.expediteurs} expéditeur${s(stats.expediteurs)} externe${s(stats.expediteurs)}` +
    (stats.listes ? `, ${stats.listes} e-mail${s(stats.listes)} de listes de diffusion écarté${s(stats.listes)}` : "") +
    (stats.interrompu ? " (analyse arrêtée avant la fin)" : "") + ".";

  // Un contact à la fois : on applique ou on passe, puis on avance.
  let rang = 0;
  let enregistres = 0;
  let passes = 0;
  const problemes: string[] = [];

  const fin = () => {
    const restants = propositions.length - rang;
    bilan.textContent = propositions.length
      ? `Terminé : ${enregistres} contact${s(enregistres)} mis à jour, ${passes} passé${s(passes)}${restants > 0 ? `, ${restants} non vu${s(restants)}` : ""}.`
      : "Tous vos contacts sont à jour";
    cartes.innerHTML = `<p class="note" style="margin:-10px 0 18px">${detail}</p>`;
    message(problemes.length ? `Non enregistré — ${problemes.join(" · ")}` : "");
    pied.hidden = true;
  };

  const montrer = () => {
    if (rang >= propositions.length) return fin();
    const p = propositions[rang];
    bilan.innerHTML = `Contact ${rang + 1} sur ${propositions.length}<span class="compteur">${enregistres} mis à jour · ${passes} passé${s(passes)}</span>`;
    cartes.innerHTML =
      (rang === 0 ? `<p class="note" style="margin:-10px 0 18px">${detail}</p>` : "") +
      rendreCarte(String(rang), p.expediteur, p.lignes, {
        badge: p.fiches.length === 0 ? "Nouveau contact" : p.fiches.length > 1 ? "Doublon" : undefined,
        date: `Dernier e-mail le ${dateCourte(p.date)}`,
        lecture: p.signature.confidence === "basse" ? "Lecture incertaine : rien n'est coché." : p.signature.note ?? undefined,
      });
    etat();
    cartes.scrollIntoView({ block: "start" });
  };

  const etat = () => {
    const n = nbCochees(cartes);
    appliquer.textContent = !ecritureActivee ? "Suivant" : n ? `Appliquer (${n}) et continuer` : "Appliquer et continuer";
    appliquer.disabled = ecritureActivee && n === 0;
  };
  cartes.onchange = etat;

  appliquer.onclick = async () => {
    if (!ecritureActivee) { rang++; return montrer(); }
    const p = propositions[rang];
    const nom = p.expediteur.name || p.expediteur.email;
    const { lignes, cochees } = lireSaisie(String(rang), p.lignes);
    const { ajouts, refus } = construireMiseAJour(lignes, cochees);
    appliquer.disabled = passer.disabled = terminer.disabled = true;
    try {
      const nonEcrits = [...refus];
      if (Object.keys(ajouts).length) {
        nonEcrits.push(...(await src.ecrire(p.fiches[0] ?? null, ajouts)));
        enregistres++;
      }
      if (nonEcrits.length) problemes.push(`${nom} : ${nonEcrits.join(", ")}`);
      message("");
      rang++;
      montrer();
    } catch (e) {
      // On reste sur ce contact : l'utilisateur peut réessayer ou le passer.
      message(`${nom} : rien n'a été enregistré. ${(e as Error).message}`);
      etat();
    } finally {
      passer.disabled = terminer.disabled = false;
    }
  };
  passer.onclick = () => { passes++; rang++; message(""); montrer(); };
  terminer.onclick = fin;

  pied.hidden = propositions.length === 0;
  message("");
  $("resultats-historique").hidden = false;
  montrer();
}

// ——— Signature collée par l'utilisateur ———

function initialiserCollage(src: Sources) {
  const champ = $<HTMLTextAreaElement>("signature-collee");
  const lire = () => {
    $("effacer-collage").hidden = false;
    void vueEmail(src, champ.value);
  };
  // Le collage suffit : la lecture part aussitôt, sans autre clic. Avec une clé Claude, on attend le clic
  // sur « Lire cette signature », pour qu'un mauvais collage ne parte pas chez Anthropic.
  champ.addEventListener("paste", () => { if (!lireCle()) setTimeout(lire, 0); });
  $("lire-collage").onclick = lire;
  $("effacer-collage").onclick = () => void vueEmail(src);
}

// ——— Démarrage ———

export async function demarrer(src: Sources, vueInitiale: "email" | "historique" = "email") {
  initialiserOnglets(src);
  initialiserOptions();
  if (vueInitiale === "historique") $("onglet-historique").click();
  src.surChangement(() => void vueEmail(src));
  initialiserCollage(src);
  await vueEmail(src);
}

/** Sources réelles : Office.js et Microsoft Graph. */
async function sourcesOutlook(): Promise<Sources> {
  const { jeton } = await import("./auth");
  const graph = await import("./graph");
  return {
    lireEmail: () =>
      new Promise((ok, ko) => {
        const item = Office.context.mailbox.item;
        if (!item || !item.from) return ok(null); // rien de sélectionné, ou pas un e-mail reçu
        item.body.getAsync(Office.CoercionType.Text, (r) => {
          if (r.status !== Office.AsyncResultStatus.Succeeded) return ko(new Error("Lecture de l'e-mail impossible."));
          ok({ expediteur: { name: item.from.displayName, email: item.from.emailAddress }, corps: r.value });
        });
      }),
    signaler: (texte) => {
      const notes = Office.context.mailbox.item?.notificationMessages;
      if (!notes) return;
      if (!texte) return notes.removeAsync("maj-contact", () => undefined);
      notes.replaceAsync(
        "maj-contact",
        { type: Office.MailboxEnums.ItemNotificationMessageType.InformationalMessage, message: texte, icon: "Icon.16x16", persistent: false },
        () => undefined, // une barre refusée par le client n'empêche pas le volet de fonctionner
      );
    },
    surChangement: (rappel) => {
      // Disponible quand le volet est épinglé (Mailbox 1.5) ; sans effet sinon.
      if (Office.context.requirements.isSetSupported("Mailbox", "1.5")) {
        Office.context.mailbox.addHandlerAsync(Office.EventType.ItemChanged, rappel);
      }
    },
    moi: () => Office.context.mailbox.userProfile.emailAddress,
    chercher: async (email) => graph.chercherParEmail(await jeton(scopesContacts), email),
    analyser: lireSignature,
    ecrire: async (fiche, ajouts) => {
      const t = await jeton(scopesContacts);
      const { corps, refus } = fusionner(fiche?.id ? await graph.obtenir(t, fiche.id) : null, ajouts);
      if (Object.keys(corps).length) {
        if (fiche?.id) await graph.mettreAJour(t, fiche.id, corps);
        else await graph.creer(t, corps);
      }
      return refus;
    },
    // Mail.Read n'est demandé qu'ici, au premier scan de l'historique.
    listerContacts: async () => graph.listerContacts(await jeton(scopesHistorique)),
    listerMessages: async (depuis, progression, annule) =>
      graph.listerMessages(await jeton(scopesHistorique), depuis, progression, annule),
  };
}

function erreurDemarrage(e: unknown) {
  $("chargement").hidden = true;
  $("message").hidden = false;
  $("message").textContent = `Le complément n'a pas pu démarrer : ${(e as Error)?.message ?? e}`;
}

const parametres = new URLSearchParams(location.search);
if (parametres.has("demo")) {
  import("./demo")
    .then((d) => demarrer(d.sourcesDemo(location.search), parametres.get("demo") === "historique" ? "historique" : "email"))
    .catch(erreurDemarrage);
} else if (!configure) {
  // Manifeste sans identifiants (ou modifié à la main) : on explique plutôt que d'échouer à la connexion.
  Office.onReady(() => {
    $("chargement").hidden = true;
    $("message").hidden = false;
    $("message").innerHTML =
      'Lumento n\'est pas configuré pour votre organisation. Votre administrateur doit créer le manifeste sur <a href="manifest.html" target="_blank" rel="noopener">la page dédiée</a>.';
  });
} else {
  Office.onReady(() => sourcesOutlook().then((src) => demarrer(src)).catch(erreurDemarrage));
}
