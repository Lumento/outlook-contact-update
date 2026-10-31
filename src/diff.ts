// Compare la fiche Outlook et la signature, champ par champ, selon les règles :
// un champ vide se complète, un champ rempli ne change qu'après validation, rien ne s'efface.

import { ContactGraph, LigneComparaison, SignatureExtraite } from "./types";
import {
  formatTelephone,
  memeNumero,
  nomFamille,
  prenom,
  propre,
  service,
  societe,
  typeTelephone,
} from "./normalize";

const egal = (a: string, b: string) => a.localeCompare(b, "fr", { sensitivity: "base" }) === 0;

/** Limites des fiches contacts Outlook. */
export const MAX_EMAILS = 3;
export const MAX_TEL_PRO = 2;

export const emailValide = (v: string) => /^[^\s@<>()",;]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(v) && v.length <= 254;
export const telephoneValide = (v: string) => /^[+\d\s().\-]{6,30}$/.test(v) && (v.match(/\d/g) ?? []).length >= 6;
const domaine = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

function texte(
  champ: LigneComparaison["champ"],
  libelle: string,
  actuel: string | null | undefined,
  propose: string | null,
  majusculesImposees = false,
): LigneComparaison | null {
  if (!propose) return null;
  const id = champ;
  const a = propre(actuel) ?? "";
  if (a === "") return { id, champ, libelle, actuel: "", propose, statut: "completer", cocheParDefaut: true };
  if (a === propose) return { id, champ, libelle, actuel: a, propose, statut: "identique", cocheParDefaut: false };
  if (egal(a, propose) && majusculesImposees) {
    return {
      id, champ, libelle, actuel: a, propose, statut: "conflit", cocheParDefaut: true,
      remarque: "Mise en majuscules seulement.",
    };
  }
  if (egal(a, propose)) return { id, champ, libelle, actuel: a, propose: a, statut: "identique", cocheParDefaut: false };
  return { id, champ, libelle, actuel: a, propose, statut: "conflit", cocheParDefaut: false };
}

/** Répartit les numéros de la signature entre mobile et professionnel d'après leur préfixe. */
function classerNumeros(s: SignatureExtraite): { mobile: string | null; pro: string | null } {
  let mobile: string | null = null;
  let pro: string | null = null;
  const candidats: [string | null, "mobile" | "pro"][] = [
    [s.mobilePhone, "mobile"],
    [s.businessPhone, "pro"],
  ];
  for (const [num, place] of candidats) {
    const f = formatTelephone(num);
    if (!f || !telephoneValide(f)) continue;
    const t = typeTelephone(f);
    const cible = t === "mobile" ? "mobile" : t === "professionnel" ? "pro" : place;
    if (cible === "mobile" && !mobile) mobile = f;
    else if (cible === "pro" && !pro) pro = f;
  }
  return { mobile, pro };
}

export function comparer(
  contact: ContactGraph | null,
  s: SignatureExtraite,
  expediteur: { name: string; email: string },
): LigneComparaison[] {
  const c: ContactGraph = contact ?? {};
  const lignes: (LigneComparaison | null)[] = [
    texte("givenName", "Prénom", c.givenName, prenom(s.givenName)),
    texte("surname", "Nom de famille", c.surname, nomFamille(s.surname), true),
    texte("companyName", "Entreprise", c.companyName, societe(s.companyName), true),
    texte("jobTitle", "Poste", c.jobTitle, propre(s.jobTitle)),
    texte("department", "Service", c.department, service(s.department)),
  ];

  const { mobile, pro } = classerNumeros(s);
  const tousNumeros = [c.mobilePhone ?? "", ...(c.businessPhones ?? []), ...(c.homePhones ?? [])].filter(Boolean);

  if (mobile) {
    const actuel = propre(c.mobilePhone) ?? "";
    if (actuel === "") {
      const ailleurs = tousNumeros.some((n) => memeNumero(n, mobile));
      lignes.push({
        id: "mobilePhone", champ: "mobilePhone", libelle: "Mobile", actuel: "", propose: mobile,
        statut: ailleurs ? "identique" : "completer", cocheParDefaut: !ailleurs,
        remarque: ailleurs ? "Déjà présent dans un autre champ téléphone." : undefined,
      });
    } else if (memeNumero(actuel, mobile)) {
      lignes.push({ id: "mobilePhone", champ: "mobilePhone", libelle: "Mobile", actuel, propose: mobile, statut: "identique", cocheParDefaut: false });
    } else {
      lignes.push({
        id: "mobilePhone", champ: "mobilePhone", libelle: "Mobile", actuel, propose: mobile, statut: "conflit", cocheParDefaut: false,
        remarque: "Outlook n'accepte qu'un mobile : l'ancien numéro serait remplacé.",
      });
    }
  }

  if (pro) {
    const present = tousNumeros.some((n) => memeNumero(n, pro));
    const plein = (c.businessPhones ?? []).length >= MAX_TEL_PRO;
    lignes.push({
      id: "businessPhones", champ: "businessPhones", libelle: "Téléphone professionnel",
      actuel: (c.businessPhones ?? []).join(" · "), propose: pro,
      statut: present ? "identique" : "ajouter", cocheParDefaut: !present && !plein,
      remarque: present ? undefined : plein
        ? `La fiche a déjà ${MAX_TEL_PRO} téléphones professionnels : libérez-en un dans Outlook.`
        : "Ajouté ; les numéros existants sont conservés.",
    });
  }

  // L'adresse d'envoi est toujours proposée (cochée si absente). Une autre adresse lue dans la signature
  // peut avoir été écrite par n'importe qui (e-mail usurpé) : elle est proposée à part, décochée.
  const envoi = expediteur.email.trim().toLowerCase();
  const adresses = (c.emailAddresses ?? []).map((e) => (e.address ?? "").toLowerCase());
  const plein = adresses.length >= MAX_EMAILS;
  const ligneEmail = (id: string, email: string, coche: boolean, remarque?: string): LigneComparaison => {
    const present = adresses.includes(email);
    return {
      id, champ: "emailAddresses", libelle: "E-mail", actuel: adresses.join(" · "), propose: email,
      statut: present ? "identique" : "ajouter", cocheParDefaut: !present && coche && !plein,
      remarque: present ? undefined : plein ? `La fiche a déjà ${MAX_EMAILS} adresses : libérez-en une dans Outlook.` : remarque,
    };
  };
  if (emailValide(envoi)) lignes.push(ligneEmail("emailAddresses", envoi, true));
  const lue = propre(s.email)?.toLowerCase();
  if (lue && lue !== envoi && emailValide(lue)) {
    lignes.push(ligneEmail("emailSignature", lue, false, domaine(lue) === domaine(envoi)
      ? `Autre adresse lue dans la signature : vérifiez avant d'ajouter.`
      : `Adresse d'un autre domaine que l'expéditeur (${domaine(envoi)}) : vérifiez avant d'ajouter.`));
  }

  const resultat = lignes.filter((l): l is LigneComparaison => l !== null);
  if (s.confidence === "basse") for (const l of resultat) l.cocheParDefaut = false;
  return resultat;
}

/**
 * Changements à écrire, d'après les lignes cochées (par identifiant). Une valeur vide ou invalide
 * n'est jamais écrite (rien ne s'efface) : elle est listée dans « refus ». Les listes ne contiennent
 * que les valeurs à AJOUTER : voir fusionner().
 */
export function construireMiseAJour(
  lignes: LigneComparaison[],
  cochees: Set<string>,
): { ajouts: Partial<ContactGraph>; refus: string[] } {
  const ajouts: Partial<ContactGraph> = {};
  const refus: string[] = [];
  for (const l of lignes) {
    if (!cochees.has(l.id) || l.statut === "identique") continue;
    const v = l.propose.trim().slice(0, 200);
    if (!v) continue;
    const valide = l.champ === "emailAddresses" ? emailValide(v) : l.champ.endsWith("Phone") || l.champ === "businessPhones" ? telephoneValide(v) : true;
    if (!valide) {
      refus.push(`${l.libelle} « ${v} » (format invalide)`);
      continue;
    }
    if (l.champ === "businessPhones") ajouts.businessPhones = [...(ajouts.businessPhones ?? []), v];
    else if (l.champ === "emailAddresses") ajouts.emailAddresses = [...(ajouts.emailAddresses ?? []), { address: v.toLowerCase() }];
    else (ajouts as Record<string, string>)[l.champ] = v;
  }
  return { ajouts, refus };
}

/**
 * Corps final, calculé sur la fiche relue juste avant l'écriture (elle a pu changer pendant un long scan) :
 * les listes existantes sont conservées et complétées dans les limites d'Outlook. Une liste pleine est
 * laissée telle quelle et signalée dans « refus » ; les autres champs sont écrits quand même.
 */
export function fusionner(
  fiche: ContactGraph | null,
  ajouts: Partial<ContactGraph>,
): { corps: Partial<ContactGraph>; refus: string[] } {
  const corps: Partial<ContactGraph> = { ...ajouts };
  const refus: string[] = [];
  if (ajouts.businessPhones) {
    const actuels = fiche?.businessPhones ?? [];
    const nouveaux = ajouts.businessPhones.filter((n) => !actuels.some((a) => memeNumero(a, n)));
    if (!nouveaux.length) delete corps.businessPhones;
    else if (actuels.length + nouveaux.length > MAX_TEL_PRO) {
      delete corps.businessPhones;
      refus.push(`téléphone professionnel (la fiche en a déjà ${actuels.length})`);
    } else corps.businessPhones = [...actuels, ...nouveaux];
  }
  if (ajouts.emailAddresses) {
    const actuels = fiche?.emailAddresses ?? [];
    const nouveaux = ajouts.emailAddresses.filter((e) => !actuels.some((a) => a.address?.toLowerCase() === e.address));
    if (!nouveaux.length) delete corps.emailAddresses;
    else if (actuels.length + nouveaux.length > MAX_EMAILS) {
      delete corps.emailAddresses;
      refus.push(`adresse e-mail (la fiche en a déjà ${actuels.length})`);
    } else corps.emailAddresses = [...actuels, ...nouveaux];
  }
  return { corps, refus };
}
