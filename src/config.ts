// Configuration de l'organisation, lue dans l'adresse du volet.
// Chaque organisation génère son propre manifeste (page manifest.html) : ses identifiants y figurent
// et Outlook les transmet ici. Le site public et le dépôt ne contiennent aucune donnée d'organisation.

declare const __HOST__: string;

export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DOMAINE = /^(?=.{3,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export interface Configuration {
  host: string;
  clientId: string;
  tenantId: string;
  internalDomains: string[];
  ecriture: boolean;
}

/** Lit et valide les paramètres : c = ID d'application, t = ID de locataire, d = domaines internes, w = écriture. */
export function lireConfiguration(recherche: string, host: string): Configuration {
  const p = new URLSearchParams(recherche);
  const guid = (v: string | null) => (v && GUID.test(v) ? v.toLowerCase() : "");
  return {
    host,
    clientId: guid(p.get("c")),
    tenantId: guid(p.get("t")),
    internalDomains: (p.get("d") ?? "")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter((d) => DOMAINE.test(d))
      .slice(0, 10),
    ecriture: p.get("w") === "1",
  };
}

export const config = lireConfiguration(typeof location === "undefined" ? "" : location.search, typeof __HOST__ === "undefined" ? "" : __HOST__);
export const configure = Boolean(config.clientId && config.tenantId);

/** Droit Microsoft Graph pour lire et compléter les contacts. */
export const scopesContacts = ["Contacts.ReadWrite"];
/** Droit supplémentaire, demandé seulement pour le scan de l'historique (lecture seule). */
export const scopesHistorique = ["Contacts.ReadWrite", "Mail.Read"];

/** false : le volet propose sans enregistrer (mode test). */
export const ecritureActivee = config.ecriture;
