// Mode démonstration, sans Outlook ni connexion, avec des données fictives :
//   taskpane.html?demo             e-mail d'un contact existant
//   taskpane.html?demo=nouveau     e-mail d'un expéditeur absent des contacts
//   taskpane.html?demo=historique  scan de l'historique

import { analyserLocalement } from "./parser";
import { MessageResume } from "./history";
import { ContactGraph } from "./types";

const CORPS = `Bonjour,

Voici les plans mis à jour pour la réunion de vendredi.

Bien cordialement,

Jeanne DUPONT
Cheffe de projet
BET Exemple – Fluides
Mob. 06 11 22 33 44
Tél. 01 40 00 00 00
Standard : 01 40 00 00 99
jeanne.dupont@bet-exemple.fr
www.bet-exemple.fr

De : Paul MARTIN <paul.martin@exemple.fr>
Envoyé : lundi 26 octobre 2026 10:12
Objet : Plans
`;

const CONTACTS: ContactGraph[] = [
  {
    id: "demo-1", givenName: "Jeanne", surname: "Dupont", companyName: "BET EXEMPLE", jobTitle: "", department: "",
    mobilePhone: "0611223344", businessPhones: [], emailAddresses: [{ address: "jeanne.dupont@bet-exemple.fr" }],
  },
  {
    id: "demo-2", givenName: "Marc", surname: "MARTIN", companyName: "SOCIÉTÉ EXEMPLE SAS", jobTitle: "Conducteur de travaux",
    department: "", mobilePhone: "+33 6 12 34 56 78", businessPhones: [], emailAddresses: [{ address: "m.martin@societe-exemple.fr" }],
  },
  {
    id: "demo-3", givenName: "Claire", surname: "PETIT", companyName: "RÉGION EXEMPLE", jobTitle: "Directrice de projets",
    department: "Pôle lycées", mobilePhone: "", businessPhones: [], emailAddresses: [{ address: "claire.petit@region-exemple.fr" }],
  },
];

const jours = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

const HISTORIQUE: MessageResume[] = [
  { expediteur: { name: "Jeanne DUPONT", email: "jeanne.dupont@bet-exemple.fr" }, date: jours(2), texte: CORPS },
  {
    expediteur: { name: "MARTIN Marc", email: "m.martin@societe-exemple.fr" }, date: jours(9),
    texte: "Bonjour,\nC'est noté.\nCordialement\nMarc Martin | Directeur de travaux\nSOCIÉTÉ EXEMPLE SAS\nLigne directe : 01 23 45 67 89\nPortable : 06 12 34 56 78",
  },
  {
    expediteur: { name: "Claire PETIT", email: "claire.petit@region-exemple.fr" }, date: jours(15),
    texte: "Merci pour l'envoi.\nClaire PETIT\nDirectrice de projets\nPôle lycées\nRégion Exemple",
  },
  {
    expediteur: { name: "Paul DURAND", email: "paul.durand@entreprise-exemple.fr" }, date: jours(21),
    texte: "Bonjour,\nJe vous transmets notre offre.\nBien à vous,\nPaul DURAND\nChargé d'affaires\nEntreprise Exemple\nMob. 07 11 22 33 44",
  },
  { expediteur: { name: "Lettre d'info", email: "noreply@lettre-exemple.fr" }, date: jours(3), texte: "Découvrez nos offres du mois." },
  {
    // Liste de diffusion : écartée, la signature n'est pas celle de la personne.
    expediteur: { name: "Claire PETIT via Club Exemple", email: "club@listes-exemple.fr" }, date: jours(1),
    texte: "Bonjour à tous,\nProchaine rencontre jeudi.\nClaire PETIT\nPrésidente du club\nTél. 01 99 99 99 99", liste: true,
  },
  {
    expediteur: { name: "Paul DURAND", email: "paul.durand@entreprise-exemple.fr" }, date: jours(4),
    texte: "Notre lettre d'octobre.\nPaul DURAND\nDirecteur commercial\nPour vous désinscrire, cliquez ici.",
  },
];

export function sourcesDemo(query: string) {
  const nouveau = query.includes("nouveau");
  return {
    lireEmail: async () => ({ expediteur: { name: "Jeanne Dupont", email: "jeanne.dupont@bet-exemple.fr" }, corps: CORPS }),
    moi: () => "vous@votre-domaine.fr",
    signaler: (texte: string | null) => {
      // Imite la barre d'alerte qu'Outlook affiche sous l'objet de l'e-mail.
      const barre = document.getElementById("barre-outlook-demo");
      if (barre) { barre.hidden = !texte; barre.textContent = texte ?? ""; }
    },
    surChangement: () => undefined,
    chercher: async () => (nouveau ? [] : [CONTACTS[0]]),
    analyser: async (exp: { name: string; email: string }, fragment: string) => ({ ...analyserLocalement(fragment, exp), methode: "locale" as const }),
    ecrire: async () => [] as string[],
    listerContacts: async () => CONTACTS,
    listerMessages: async (_depuis: string, progression: (n: number) => void) => {
      progression(HISTORIQUE.length);
      return HISTORIQUE;
    },
  };
}
