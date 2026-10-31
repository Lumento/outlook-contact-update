/** Résultat renvoyé par le serveur d'analyse (Claude). */
export interface SignatureExtraite {
  found: boolean;
  confidence: "haute" | "moyenne" | "basse";
  givenName: string | null;
  surname: string | null;
  companyName: string | null;
  jobTitle: string | null;
  department: string | null;
  mobilePhone: string | null;
  businessPhone: string | null;
  email: string | null;
  /** Remarque éventuelle (ex. « numéro du standard ignoré »). */
  note?: string | null;
  /** Comment la signature a été lue. */
  methode?: "locale" | "claude";
}

/** Sous-ensemble d'un contact Microsoft Graph (/me/contacts). */
export interface ContactGraph {
  id?: string;
  givenName?: string | null;
  surname?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  mobilePhone?: string | null;
  businessPhones?: string[];
  homePhones?: string[];
  emailAddresses?: { name?: string; address: string }[];
}

export type Champ =
  | "givenName"
  | "surname"
  | "companyName"
  | "jobTitle"
  | "department"
  | "mobilePhone"
  | "businessPhones"
  | "emailAddresses";

/**
 * identique : rien à faire (ligne grisée)
 * completer : champ vide dans Outlook, coché par défaut
 * ajouter   : nouvelle valeur ajoutée à une liste sans rien retirer, cochée par défaut
 * conflit   : valeur différente, décochée par défaut
 */
export type Statut = "identique" | "completer" | "ajouter" | "conflit";

export interface LigneComparaison {
  /** Identifiant de la ligne (le champ, sauf quand un même champ a deux lignes). */
  id: string;
  champ: Champ;
  libelle: string;
  actuel: string;
  propose: string;
  statut: Statut;
  cocheParDefaut: boolean;
  remarque?: string;
}
