// Analyseur de signature local : aucune donnée ne quitte Outlook.
// Fiable pour les téléphones et les e-mails ; le poste, la société et le service
// sont repérés par des indices et restent modifiables dans le volet.

import { SignatureExtraite } from "./types";

/** Minuscules, sans accents ni ponctuation : « Société-Exemple » → « societeexemple ». */
export function cle(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const FORMULES = /^(bien\s+)?(cordialement|à bientôt|a bientot|bien à (vous|toi)|sincères salutations|salutations|meilleures salutations|best regards|kind regards|regards|merci( beaucoup)?|bonne (journée|soirée|fin de journée))\b[\s,.!]*$/i;
const ADRESSE = /\b\d{5}\b|\b(rue|avenue|av\.|boulevard|bd|place|chemin|allée|allee|impasse|quai|route|cedex|cs\s*\d+|bp\s*\d+)\b/i;
const MENTIONS = /confidenti|destinataire|imprimer|environnement|pi[eè]ces? jointes?|disclaimer|intended recipient|ne pas r[ée]pondre/i;
const RESEAUX = /linkedin|facebook|instagram|twitter|youtube|https?:\/\/|www\./i;
const FORMES = /\b(SAS|SARL|SA|SASU|EURL|SCOP|SCP|SELARL|GIE|SEM|SPL|Groupe|Group|Architectes?|Ing[ée]nierie|Bureau d'[ée]tudes|BET|BE|Atelier|Agence)\b/;
const SERVICE = /\b(service|p[ôo]le|d[ée]partement|direction|division|agence de|cellule)\b/i;
const WEBMAILS = /^(gmail|googlemail|yahoo|hotmail|outlook|live|msn|orange|wanadoo|free|laposte|sfr|icloud|me|aol|proton|protonmail|gmx)\./i;

// Numéros français (06 12 34 56 78, +33 (0)6…, 0033 6…) ou internationaux (+41 22 …).
const TELEPHONE = /(?:\+33\s?\(0\)\s?|\+33\s?|0033\s?|\b0)[1-9](?:[\s.\-]?\d{2}){4}\b|\+(?!33)\d{2,3}(?:[\s.\-]?\d{1,4}){3,5}/g;
const LIB_MOBILE = /\b(mob(ile)?|port(able)?|cell(ulaire)?|gsm|m)\b\.?\s*:?\s*$/i;
const LIB_PRO = /\b(t[ée]l(\.|[ée]phone)?|fixe|ligne directe|direct|bureau|office|t|ld)\b\.?\s*:?\s*$/i;
const LIB_IGNORE = /\b(fax|t[ée]l[ée]copie|standard|accueil|secr[ée]tariat|r[ée]ception|astreinte)\b\.?\s*:?\s*$/i;
const SEPARATEUR_TITRE = /\s+[|–—-]\s+|\s*,\s+/;

interface Nom {
  prenom: string | null;
  nom: string | null;
}

/** Prénom et nom d'après le nom affiché et l'adresse de l'expéditeur. */
export function nomExpediteur(affiche: string, email: string): Nom {
  const local = email.split("@")[0] ?? "";
  const partiesEmail = local.split(/[._-]+/).filter((p) => /^[a-z]+$/i.test(p));
  const mots = affiche.replace(/[<>"(),]/g, " ").split(/\s+/).filter((m) => /\p{L}/u.test(m) && !m.includes("@"));

  if (mots.length >= 2) {
    // Un mot tout en majuscules est le nom de famille (« MOREAU Lucas », « Olivier BERNARD »).
    const majuscules = mots.filter((m) => m.length > 1 && m === m.toLocaleUpperCase("fr-FR") && m !== m.toLocaleLowerCase("fr-FR"));
    if (majuscules.length > 0 && majuscules.length < mots.length) {
      return { nom: majuscules.join(" "), prenom: mots.filter((m) => !majuscules.includes(m)).join(" ") };
    }
    // Sinon, le mot qui correspond à la fin de l'adresse (prenom.nom@).
    const dernier = partiesEmail[partiesEmail.length - 1];
    if (dernier && dernier.length > 1) {
      const cleDernier = cle(dernier);
      const i = mots.findIndex((m) => cle(m) === cleDernier);
      if (i >= 0) return { nom: mots.slice(i).join(" "), prenom: mots.slice(0, i).join(" ") || null };
    }
    return { prenom: mots.slice(0, -1).join(" "), nom: mots[mots.length - 1] };
  }
  if (partiesEmail.length === 2 && partiesEmail[0].length > 1 && partiesEmail[1].length > 1) {
    return { prenom: partiesEmail[0], nom: partiesEmail[1] };
  }
  return { prenom: null, nom: mots[0] ?? null };
}

function domaineRacine(email: string): string | null {
  const d = (email.split("@")[1] ?? "").toLowerCase();
  if (!d || WEBMAILS.test(d)) return null;
  const parties = d.split(".");
  return cle(parties.length >= 2 ? parties[parties.length - 2] : parties[0]);
}

interface Numero {
  valeur: string;
  type: "mobile" | "pro" | "ignore" | "inconnu";
}

export function lireNumeros(ligne: string): Numero[] {
  const r: Numero[] = [];
  let debut = 0;
  for (const m of ligne.matchAll(TELEPHONE)) {
    const avant = ligne.slice(debut, m.index);
    const type = LIB_IGNORE.test(avant) ? "ignore" : LIB_MOBILE.test(avant) ? "mobile" : LIB_PRO.test(avant) ? "pro" : "inconnu";
    r.push({ valeur: m[0].trim(), type });
    debut = (m.index ?? 0) + m[0].length;
  }
  return r;
}

function typeParPrefixe(n: string): "mobile" | "pro" | "inconnu" {
  const d = n.replace(/\(0\)/g, "").replace(/\D/g, "").replace(/^(0033|33)/, "0");
  if (/^0[67]\d{8}$/.test(d)) return "mobile";
  if (/^0[1-59]\d{8}$/.test(d)) return "pro";
  return "inconnu";
}

export function analyserLocalement(fragment: string, expediteur: { name: string; email: string }): SignatureExtraite {
  const lignes = fragment.slice(0, 20_000).split("\n").map((l) => l.slice(0, 500).trim()).filter(Boolean);
  const nomExp = nomExpediteur(expediteur.name.slice(0, 200), expediteur.email.slice(0, 254));
  const racine = domaineRacine(expediteur.email);
  const notes: string[] = [];

  // 1. Début de la signature : la ligne du nom, à défaut la formule de politesse.
  const cleNom = nomExp.nom ? cle(nomExp.nom) : "";
  let iNom = -1;
  for (let i = lignes.length - 1; i >= 0; i--) {
    const l = lignes[i];
    if (cleNom.length > 1 && l.length < 80 && !l.includes("@") && !/\d{3}/.test(l) && cle(l).includes(cleNom)) {
      iNom = i;
      // On garde la première occurrence du bloc final (le nom peut être répété plus bas).
      while (iNom > 0 && cle(lignes[iNom - 1]).includes(cleNom) && lignes[iNom - 1].length < 80) iNom--;
      break;
    }
  }
  let debut = iNom;
  if (debut < 0) {
    const iFormule = lignes.findIndex((l) => FORMULES.test(l));
    debut = iFormule >= 0 ? iFormule + 1 : Math.max(0, lignes.length - 10);
  }
  const bloc = lignes.slice(debut);

  // 2. Nom (graphie de la signature si elle existe) et poste éventuel sur la même ligne.
  let prenom = nomExp.prenom;
  let nom = nomExp.nom;
  let poste: string | null = null;
  if (iNom >= 0) {
    const [partieNom, ...reste] = lignes[iNom].split(SEPARATEUR_TITRE);
    const mots = partieNom.split(/\s+/);
    const iMot = mots.findIndex((m) => cleNom.startsWith(cle(m)) && cle(m).length > 1);
    if (iMot >= 0) {
      const nbMotsNom = Math.max(1, nomExp.nom!.split(/\s+/).length);
      const motsNom = mots.slice(iMot, iMot + nbMotsNom);
      nom = motsNom.join(" ");
      const autres = mots.filter((_, j) => j < iMot || j >= iMot + nbMotsNom).join(" ").trim();
      if (autres) prenom = autres;
    }
    if (reste.length) poste = reste.join(" - ").trim() || null;
  }

  // 3. Lignes suivantes : numéros, e-mails, et lignes de texte candidates.
  let mobile: string | null = null;
  let fixe: string | null = null;
  const emails: string[] = [];
  const candidates: string[] = [];
  for (const l of bloc.slice(iNom >= 0 ? 1 : 0)) {
    if (l.length > 100 || MENTIONS.test(l)) continue;
    for (const e of l.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []) emails.push(e.toLowerCase());
    const numeros = lireNumeros(l);
    for (const n of numeros) {
      const type = n.type === "inconnu" ? typeParPrefixe(n.valeur) : n.type;
      if (type === "ignore") notes.push(`Numéro « ${n.valeur} » ignoré (standard, accueil ou fax).`);
      else if (type === "mobile" && !mobile) mobile = n.valeur;
      else if ((type === "pro" || type === "inconnu") && !fixe) fixe = n.valeur;
    }
    if (numeros.length || l.includes("@") || RESEAUX.test(l) || ADRESSE.test(l)) continue;
    if (FORMULES.test(l) || /\d{4,}/.test(l)) continue;
    candidates.push(l);
  }

  // 4. Société : la ligne qui reprend le domaine de l'adresse, à défaut une forme juridique.
  let societe: string | null = null;
  let service: string | null = null;
  let iSociete = racine && racine.length > 2 ? candidates.findIndex((l) => cle(l).includes(racine)) : -1;
  if (iSociete < 0) iSociete = candidates.findIndex((l) => FORMES.test(l) && l.length < 60);
  if (iSociete >= 0) {
    const [s, ...reste] = candidates[iSociete].split(/\s+[|–—-]\s+/);
    societe = s.trim();
    if (reste.length) service = reste.join(" - ").trim();
  }
  const autres = candidates.filter((_, i) => i !== iSociete);
  if (!service) service = autres.find((l) => SERVICE.test(l) && l.length < 60) ?? null;
  if (!poste) poste = autres.find((l) => l !== service && l.length < 60) ?? null;

  // Sans ligne de nom, une phrase du message pourrait passer pour un poste :
  // on ne retient un poste que si un autre indice de signature existe.
  if (iNom < 0 && !(societe || mobile || fixe)) poste = null;

  const email = emails.includes(expediteur.email.toLowerCase()) ? expediteur.email.toLowerCase() : emails[0] ?? null;
  const trouve = Boolean(poste || societe || mobile || fixe);
  const confidence: SignatureExtraite["confidence"] =
    iNom >= 0 && trouve ? (poste && (societe || mobile || fixe) ? "haute" : "moyenne") : trouve ? "basse" : "basse";

  return {
    found: trouve,
    confidence,
    givenName: prenom,
    surname: nom,
    companyName: societe,
    jobTitle: poste,
    department: service,
    mobilePhone: mobile,
    businessPhone: fixe,
    email,
    note: notes.length ? notes.join(" ") : null,
  };
}
