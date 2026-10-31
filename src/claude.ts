// Option : lecture de la signature par Claude, avec la clé API de l'utilisateur.
// La clé reste dans le navigateur de l'utilisateur ; aucun serveur intermédiaire.

import { SignatureExtraite } from "./types";

const CLE_STOCKAGE = "contact-signature.cle-claude";
export const MODELE = "claude-haiku-5-5";

const CONSIGNES = `Tu lis la fin d'un e-mail professionnel et tu en extrais la signature de son expéditeur.
Règles :
- Ne renvoie que ce qui figure littéralement dans le texte. Si une information est absente, mets null. Ne devine jamais.
- Ignore les mentions légales, avertissements de confidentialité, adresses, horaires, liens et réseaux sociaux.
- Si la signature appartient visiblement à une autre personne que l'expéditeur indiqué, renvoie found=false.
- Un numéro présenté comme « standard », « accueil », « fax » ou « secrétariat » n'est pas celui de la personne : ne le renvoie pas ; signale-le dans note.
- mobilePhone : mobile de la personne. businessPhone : ligne directe ou fixe professionnelle.
- department : service ou pôle s'il est écrit, sinon null.
- confidence : haute si la signature est nette, moyenne si une partie est incertaine, basse sinon.`;

const chaineOuNull = { type: ["string", "null"] };
const SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean" },
    confidence: { type: "string", enum: ["haute", "moyenne", "basse"] },
    givenName: chaineOuNull, surname: chaineOuNull, companyName: chaineOuNull, jobTitle: chaineOuNull,
    department: chaineOuNull, mobilePhone: chaineOuNull, businessPhone: chaineOuNull, email: chaineOuNull, note: chaineOuNull,
  },
  required: ["found", "confidence", "givenName", "surname", "companyName", "jobTitle", "department", "mobilePhone", "businessPhone", "email"],
};

export function lireCle(): string | null {
  try { return localStorage.getItem(CLE_STOCKAGE); } catch { return null; }
}
export function enregistrerCle(cle: string | null): void {
  try {
    if (cle) localStorage.setItem(CLE_STOCKAGE, cle.trim());
    else localStorage.removeItem(CLE_STOCKAGE);
  } catch { /* stockage indisponible : l'option reste désactivée */ }
}

export function requete(expediteur: { name: string; email: string }, fragment: string) {
  return {
    model: MODELE,
    max_tokens: 600,
    system: CONSIGNES,
    tools: [{ name: "enregistrer_signature", description: "Enregistre les informations lues dans la signature.", input_schema: SCHEMA }],
    tool_choice: { type: "tool", name: "enregistrer_signature" },
    messages: [{ role: "user", content: `Expéditeur : ${expediteur.name} <${expediteur.email}>\n\nFin de l'e-mail :\n<<<\n${fragment.slice(0, 4000)}\n>>>` }],
  };
}

/** Garde uniquement les champs attendus, au bon type ; au moindre doute, la confiance est basse. */
export function lireReponse(reponse: unknown): SignatureExtraite {
  const blocs = (reponse as { content?: { type: string; name?: string; input?: Record<string, unknown> }[] })?.content ?? [];
  const bloc = blocs.find((b) => b.type === "tool_use" && b.name === "enregistrer_signature");
  if (!bloc?.input) throw new Error("Réponse de Claude inattendue.");
  const e = bloc.input;
  const s = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 200) : null);
  const conf = e.confidence === "haute" || e.confidence === "moyenne" || e.confidence === "basse" ? e.confidence : "basse";
  return {
    found: e.found === true, confidence: conf,
    givenName: s(e.givenName), surname: s(e.surname), companyName: s(e.companyName), jobTitle: s(e.jobTitle),
    department: s(e.department), mobilePhone: s(e.mobilePhone), businessPhone: s(e.businessPhone), email: s(e.email),
    // La remarque vient d'un texte que l'expéditeur maîtrise : elle est signalée comme telle.
    note: s(e.note) ? `Remarque de Claude : ${s(e.note)}` : null,
  };
}

export async function analyserAvecClaude(cle: string, expediteur: { name: string; email: string }, fragment: string): Promise<SignatureExtraite> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cle,
      "anthropic-version": "2023-06-01",
      // Autorise l'appel direct depuis le navigateur : la clé appartient à l'utilisateur lui-même.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(requete(expediteur, fragment)),
  });
  if (r.status === 401) throw new Error("Clé API Claude refusée.");
  if (!r.ok) throw new Error(`Claude indisponible (code ${r.status}).`);
  return lireReponse(await r.json());
}
