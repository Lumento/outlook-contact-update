// Isole, dans le corps d'un e-mail, le texte écrit par l'expéditeur lui-même
// (sans le fil des messages précédents), puis en garde la fin, où se trouve la signature.

/** Lignes qui marquent le début d'un message précédent cité. */
const SEPARATEURS: RegExp[] = [
  /^\s*(De|From|Envoyé|Sent|Expéditeur)\s*:/i,
  /^\s*-{2,}\s*(Original Message|Message d'origine|Message original|Forwarded message|Message transféré)/i,
  /^\s*(Début du message réexpédié|Begin forwarded message)\s*:/i, // Apple Mail
  /^\s*Le .{3,200}a écrit\s*:\s*$/i,
  /^\s*On .{3,200}wrote:\s*$/i,
  /^\s*_{10,}\s*$/, // trait de soulignement inséré par Outlook avant « De : »
];

export const LIGNES_MAX = 30;
/** Bornes appliquées avant toute expression régulière : un e-mail piégé ne peut pas bloquer le volet. */
const CORPS_MAX = 50_000;
const LIGNE_MAX = 500;

interface Fragment {
  texte: string;
  lignes: number;
  coupe: boolean; // true si un fil précédent a été retiré
}

export function isolerMessage(corps: string): { texte: string; coupe: boolean } {
  // Le message de l'expéditeur est en tête : on ne garde que le début du corps, et des lignes de longueur bornée.
  const lignes = corps.slice(0, CORPS_MAX).replace(/\r\n?/g, "\n").split("\n").map((l) => l.slice(0, LIGNE_MAX));
  const i = lignes.findIndex((l) => l.trimStart().startsWith(">") || SEPARATEURS.some((re) => re.test(l)));
  return i < 0 ? { texte: lignes.join("\n"), coupe: false } : { texte: lignes.slice(0, i).join("\n"), coupe: true };
}

/** Fin du message propre à l'expéditeur : au plus LIGNES_MAX lignes non vides. */
export function extraireFragment(corps: string, max = LIGNES_MAX): Fragment {
  const { texte, coupe } = isolerMessage(corps);
  const nonVides = texte
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l !== "");
  const garde = nonVides.slice(-max);
  return { texte: garde.join("\n"), lignes: garde.length, coupe };
}

/**
 * Signature sélectionnée et collée par l'utilisateur : prise telle quelle (pas de recherche du fil cité),
 * mais bornée comme un corps d'e-mail.
 */
export function fragmentColle(texte: string, max = LIGNES_MAX): Fragment {
  const nonVides = texte
    .slice(0, 5000)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.slice(0, 500).trim())
    .filter((l) => l !== "");
  const garde = nonVides.slice(0, max);
  return { texte: garde.join("\n"), lignes: garde.length, coupe: nonVides.length > max };
}

/** Expéditeurs pour lesquels on n'analyse rien. */
export function expediteurExclu(adresse: string, domainesInternes: string[]): string | null {
  const a = adresse.trim().toLowerCase();
  const domaine = a.split("@")[1] ?? "";
  if (domainesInternes.some((d) => domaine === d || domaine.endsWith("." + d))) {
    return "Expéditeur interne : rien à mettre à jour.";
  }
  if (/^(no-?reply|ne-?pas-?repondre|notifications?|mailer-daemon|postmaster)@/.test(a)) {
    return "Adresse automatique : pas de signature nominative.";
  }
  return null;
}
