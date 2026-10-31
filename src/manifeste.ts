// Génération du manifeste d'une organisation, entièrement dans le navigateur de l'administrateur.

import { DOMAINE, GUID } from "./config";

export interface ParametresManifeste {
  host: string;
  clientId: string;
  tenantId: string;
  domaines: string[];
  organisation: string;
  ecriture: boolean;
  manifestId: string;
}

const xml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Renvoie la liste des erreurs de saisie (vide si tout est valide). */
export function verifier(p: ParametresManifeste): string[] {
  const erreurs: string[] = [];
  if (!GUID.test(p.clientId)) erreurs.push("L'ID d'application doit être un identifiant du type 00000000-0000-0000-0000-000000000000.");
  if (!GUID.test(p.tenantId)) erreurs.push("L'ID de l'annuaire (locataire) doit être un identifiant du même type.");
  if (!GUID.test(p.manifestId)) erreurs.push("L'identifiant du manifeste est invalide.");
  for (const d of p.domaines) if (!DOMAINE.test(d)) erreurs.push(`Domaine invalide : « ${d} ».`);
  if (!p.organisation.trim() || p.organisation.length > 100) erreurs.push("Indiquez le nom de l'organisation (100 caractères au plus).");
  return erreurs;
}

export function genererManifeste(modele: string, p: ParametresManifeste): string {
  const erreurs = verifier(p);
  if (erreurs.length) throw new Error(erreurs.join(" "));
  const query = new URLSearchParams({ c: p.clientId.toLowerCase(), t: p.tenantId.toLowerCase() });
  if (p.domaines.length) query.set("d", p.domaines.map((d) => d.toLowerCase()).join(","));
  if (p.ecriture) query.set("w", "1");
  const host = p.host.replace(/\/+$/, "");
  const valeurs: Record<string, string> = {
    HOST: xml(host),
    ORIGIN: xml(new URL(host).origin),
    QUERY: xml(query.toString()),
    PROVIDER: xml(p.organisation.trim()),
    MANIFEST_ID: p.manifestId.toLowerCase(),
  };
  return modele.replace(/\{\{([A-Z_]+)\}\}/g, (m, cle: string) => valeurs[cle] ?? m);
}
