// Alerte visuelle à l'ouverture d'un e-mail : faut-il signaler une mise à jour, et avec quel texte ?

import { LigneComparaison, SignatureExtraite } from "./types";

/** Longueur maximale d'une barre de notification Outlook. */
export const NOTIFICATION_MAX = 150;

export interface Alerte {
  champs: number;
  nouveau: boolean;
  texte: string;
}

/**
 * Une fiche existante est signalée dès qu'un champ diffère. Un expéditeur inconnu ne l'est que si sa
 * signature est nette, pour ne pas alerter à chaque lettre d'information ou notification.
 */
export function evaluerAlerte(
  nom: string,
  ficheExiste: boolean,
  signature: SignatureExtraite,
  lignes: LigneComparaison[],
): Alerte | null {
  const champs = lignes.filter((l) => l.statut !== "identique").length;
  if (!champs || !signature.found) return null;
  if (!ficheExiste && signature.confidence !== "haute") return null;
  const qui = nom.length > 40 ? nom.slice(0, 39) + "…" : nom;
  const s = champs > 1 ? "s" : "";
  const texte = ficheExiste
    ? `Fiche contact de ${qui} à mettre à jour : ${champs} champ${s}. Ouvrez Lumento.`
    : `${qui} n'est pas dans vos contacts. Ouvrez Lumento pour l'ajouter.`;
  return { champs, nouveau: !ficheExiste, texte: texte.slice(0, NOTIFICATION_MAX) };
}
