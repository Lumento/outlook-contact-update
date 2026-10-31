// Accès à Microsoft Graph : contacts personnels (Contacts.ReadWrite) et, pour le scan, e-mails reçus (Mail.Read).

import { entetesDeListe, MessageResume } from "./history";
import { ContactGraph } from "./types";

const GRAPH = "https://graph.microsoft.com";
const BASE = `${GRAPH}/v1.0/me/contacts`;
const CHAMPS =
  "id,givenName,surname,companyName,jobTitle,department,mobilePhone,businessPhones,homePhones,emailAddresses";

async function appel<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  // Le jeton ne part jamais ailleurs que vers Microsoft Graph, même via un lien de pagination.
  if (new URL(url).origin !== GRAPH) throw new Error("Adresse inattendue : requête refusée.");
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`Microsoft Graph a répondu ${r.status}. ${detail.slice(0, 200)}`);
  }
  return (r.status === 204 ? undefined : await r.json()) as T;
}

/** Toutes les fiches dont une adresse e-mail correspond exactement (il peut y avoir des doublons). */
export async function chercherParEmail(token: string, email: string): Promise<ContactGraph[]> {
  const adresse = email.trim().toLowerCase();
  const filtre = encodeURIComponent(`emailAddresses/any(a:a/address eq '${adresse.replace(/'/g, "''")}')`);
  const r = await appel<{ value: ContactGraph[] }>(token, `${BASE}?$filter=${filtre}&$select=${CHAMPS}&$top=10`);
  // Contrôle côté client : la comparaison du filtre peut dépendre de la casse.
  return r.value.filter((c) => (c.emailAddresses ?? []).some((e) => e.address?.toLowerCase() === adresse));
}

/** La fiche telle qu'elle est maintenant (relue juste avant une écriture). */
export async function obtenir(token: string, id: string): Promise<ContactGraph> {
  return appel<ContactGraph>(token, `${BASE}/${encodeURIComponent(id)}?$select=${CHAMPS}`);
}

export async function mettreAJour(token: string, id: string, corps: Partial<ContactGraph>): Promise<ContactGraph> {
  return appel<ContactGraph>(token, `${BASE}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(corps) });
}

export async function creer(token: string, corps: Partial<ContactGraph>): Promise<ContactGraph> {
  return appel<ContactGraph>(token, BASE, { method: "POST", body: JSON.stringify(corps) });
}

/** Toutes les fiches contacts de l'utilisateur. */
export async function listerContacts(token: string): Promise<ContactGraph[]> {
  const tout: ContactGraph[] = [];
  let url: string | undefined = `${BASE}?$select=${CHAMPS}&$top=500`;
  while (url) {
    const r: { value: ContactGraph[]; "@odata.nextLink"?: string } = await appel(token, url);
    tout.push(...r.value);
    url = r["@odata.nextLink"];
  }
  return tout;
}

interface MessageGraph {
  receivedDateTime: string;
  parentFolderId?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  uniqueBody?: { content?: string };
  internetMessageHeaders?: { name?: string; value?: string }[];
}

export const MESSAGES_MAX = 5000;

/** Dossiers jamais lus par le scan : indésirables (souvent usurpés), corbeille, brouillons, envoyés. */
const DOSSIERS_EXCLUS = ["junkemail", "deleteditems", "drafts", "sentitems", "outbox"];

async function idsDossiersExclus(token: string): Promise<Set<string>> {
  const ids = await Promise.all(
    DOSSIERS_EXCLUS.map((nom) =>
      appel<{ id: string }>(token, `${GRAPH}/v1.0/me/mailFolders/${nom}?$select=id`).then((d) => d.id, () => null),
    ),
  );
  return new Set(ids.filter((id): id is string => Boolean(id)));
}

/**
 * E-mails reçus depuis une date, tous dossiers sauf les exclus, du plus récent au plus ancien (droit Mail.Read).
 * « uniqueBody » ne contient que le texte propre au message, sans le fil cité.
 */
export async function listerMessages(
  token: string,
  depuis: string,
  progression: (lus: number) => void,
  annule: () => boolean,
): Promise<MessageResume[]> {
  const resultat: MessageResume[] = [];
  const exclus = await idsDossiersExclus(token);
  let lus = 0;
  const filtre = encodeURIComponent(`receivedDateTime ge ${depuis}`);
  let url: string | undefined =
    `${GRAPH}/v1.0/me/messages?$filter=${filtre}&$orderby=receivedDateTime desc` +
    `&$select=from,receivedDateTime,parentFolderId,uniqueBody,internetMessageHeaders&$top=50`;
  while (url && !annule() && lus < MESSAGES_MAX) {
    const r: { value: MessageGraph[]; "@odata.nextLink"?: string } = await appel(token, url, {
      headers: { Prefer: 'outlook.body-content-type="text"' },
    });
    lus += r.value.length;
    for (const m of r.value) {
      const adresse = m.from?.emailAddress?.address;
      if (!adresse || (m.parentFolderId && exclus.has(m.parentFolderId))) continue;
      resultat.push({
        expediteur: { name: m.from?.emailAddress?.name ?? "", email: adresse },
        date: m.receivedDateTime,
        texte: m.uniqueBody?.content ?? "",
        liste: entetesDeListe(m.internetMessageHeaders),
      });
    }
    progression(lus);
    url = r["@odata.nextLink"];
  }
  return resultat;
}
