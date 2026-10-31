// Scan de l'historique : pour chaque expéditeur de la période, sa signature la plus récente
// est comparée à sa fiche contact. Logique pure, sans accès à Outlook (testable).

import { comparer } from "./diff";
import { analyserLocalement } from "./parser";
import { expediteurExclu, extraireFragment } from "./signature";
import { ContactGraph, LigneComparaison, SignatureExtraite } from "./types";

export interface MessageResume {
  expediteur: { name: string; email: string };
  date: string; // ISO
  texte: string; // texte propre au message (sans le fil cité)
  /** Vrai si les en-têtes désignent une liste de diffusion ou un envoi en masse. */
  liste?: boolean;
}

export interface Proposition {
  expediteur: { name: string; email: string };
  date: string;
  fiches: ContactGraph[]; // 0 = inconnu ; 2 ou plus = doublon
  signature: SignatureExtraite;
  lignes: LigneComparaison[];
}

export const PERIODES = [
  { id: "7j", libelle: "7 derniers jours", jours: 7 },
  { id: "1m", libelle: "Dernier mois", jours: 31 },
  { id: "3m", libelle: "3 derniers mois", jours: 92 },
  { id: "6m", libelle: "6 derniers mois", jours: 183 },
  { id: "1a", libelle: "Dernière année", jours: 366 },
] as const;

export function debutPeriode(jours: number, maintenant = new Date()): string {
  return new Date(maintenant.getTime() - jours * 864e5).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Index des fiches par adresse e-mail (en minuscules). */
export function indexerContacts(contacts: ContactGraph[]): Map<string, ContactGraph[]> {
  const index = new Map<string, ContactGraph[]>();
  for (const c of contacts) {
    for (const e of c.emailAddresses ?? []) {
      const cle = e.address?.toLowerCase();
      if (!cle) continue;
      const liste = index.get(cle) ?? [];
      if (!liste.includes(c)) liste.push(c);
      index.set(cle, liste);
    }
  }
  return index;
}

// ——— Listes de diffusion ———
// Leurs signatures sont presque toujours fausses : celle de la liste, d'un tiers ou d'un modèle d'envoi.

/** En-têtes posés par les listes et les outils d'envoi en masse (RFC 2369, 2919, 3834). */
export function entetesDeListe(entetes: { name?: string; value?: string }[] | undefined): boolean {
  return (entetes ?? []).some(({ name = "", value = "" }) => {
    const n = name.toLowerCase();
    const v = value.trim().toLowerCase();
    if (n.startsWith("list-") || n === "x-mailing-list" || n === "mailing-list" || n === "x-campaign-id") return true;
    if (n === "precedence") return /^(bulk|list|junk)$/.test(v);
    if (n === "auto-submitted") return v !== "" && v !== "no";
    return false;
  });
}

const ADRESSE_DE_LISTE = /^(newsletters?|news|lettre|infolettre|mailing|marketing|listes?|listserv|diffusion|emailing|campagnes?|bounces?)([._+-]|@)/i;
const NOM_DE_LISTE = /\bvia\b/i; // « Jeanne Dupont via Club des architectes » (Google Groupes)
const DESABONNEMENT =
  /unsubscribe|d[ée]sinscri|d[ée]sabonn|ne (plus|pas) recevoir|ne souhaitez plus recevoir|g[ée]rer (vos|mes) pr[ée]f[ée]rences|version en ligne|voir (cet|l')e-?mail dans (votre|un) navigateur|view (it )?in (your )?browser/i;

/** Liste de diffusion, lettre d'information ou envoi en masse : écarté du scan. */
export function estListeDeDiffusion(m: MessageResume): boolean {
  return Boolean(m.liste) || ADRESSE_DE_LISTE.test(m.expediteur.email) || NOM_DE_LISTE.test(m.expediteur.name) || DESABONNEMENT.test(m.texte.slice(-3000)) /* les liens de désinscription sont en fin de message */;
}

/**
 * Garde, pour chaque expéditeur, son message le plus récent qui contient du texte.
 * Les messages de listes sont écartés avant : on retombe sur le dernier e-mail direct de la personne, s'il y en a un.
 */
export function dernierMessageParExpediteur(
  messages: MessageResume[],
  exclure: (email: string) => boolean,
): MessageResume[] {
  const parExpediteur = new Map<string, MessageResume>();
  for (const m of messages) {
    const cle = m.expediteur.email.toLowerCase();
    if (!cle || exclure(cle) || !m.texte.trim() || estListeDeDiffusion(m)) continue;
    const actuel = parExpediteur.get(cle);
    if (!actuel || m.date > actuel.date) parExpediteur.set(cle, m);
  }
  return [...parExpediteur.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export function construirePropositions(
  messages: MessageResume[],
  contacts: ContactGraph[],
  options: { domainesInternes: string[]; moi?: string; inclureInconnus: boolean },
): { propositions: Proposition[]; expediteurs: number; listes: number } {
  const index = indexerContacts(contacts);
  const moi = options.moi?.toLowerCase();
  const exclure = (email: string) => email === moi || expediteurExclu(email, options.domainesInternes) !== null;
  const derniers = dernierMessageParExpediteur(messages, exclure);
  const listes = messages.filter((m) => !exclure(m.expediteur.email.toLowerCase()) && estListeDeDiffusion(m)).length;

  const propositions: Proposition[] = [];
  for (const m of derniers) {
    const fiches = index.get(m.expediteur.email.toLowerCase()) ?? [];
    if (fiches.length === 0 && !options.inclureInconnus) continue;
    const signature = { ...analyserLocalement(extraireFragment(m.texte).texte, m.expediteur), methode: "locale" as const };
    if (!signature.found) continue;
    // Un inconnu n'est proposé que si sa signature est nette : sinon, trop de bruit (newsletters, notifications).
    if (fiches.length === 0 && signature.confidence === "basse") continue;
    const lignes = comparer(fiches[0] ?? null, signature, m.expediteur);
    if (!lignes.some((l) => l.statut !== "identique")) continue;
    propositions.push({ expediteur: m.expediteur, date: m.date, fiches, signature, lignes });
  }
  return { propositions, expediteurs: derniers.length, listes };
}
