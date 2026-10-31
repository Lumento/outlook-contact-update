// Données fictives uniquement.
import { describe, expect, it } from "vitest";
import { construirePropositions, debutPeriode, dernierMessageParExpediteur, entetesDeListe, estListeDeDiffusion, indexerContacts } from "../src/history";
import { ContactGraph } from "../src/types";

const sig = (nom: string, poste: string, tel: string) => `Bonjour,\nCi-joint.\nCordialement,\n${nom}\n${poste}\nMob. ${tel}`;
const m = (email: string, name: string, date: string, texte: string) => ({ expediteur: { email, name }, date, texte });

describe("scan de l'historique", () => {
  it("calcule le début de la période", () => {
    expect(debutPeriode(7, new Date("2026-10-26T12:00:00Z"))).toBe("2026-10-19T12:00:00Z");
  });

  it("garde la signature la plus récente de chaque expéditeur", () => {
    const r = dernierMessageParExpediteur(
      [
        m("a@exemple.fr", "A", "2026-10-01T10:00:00Z", "ancien"),
        m("A@exemple.fr", "A", "2026-10-20T10:00:00Z", "récent"),
        m("b@exemple.fr", "B", "2026-10-10T10:00:00Z", ""),
      ],
      () => false,
    );
    expect(r).toHaveLength(1);
    expect(r[0].texte).toBe("récent");
  });

  it("indexe les fiches par adresse, doublons compris", () => {
    const f1: ContactGraph = { id: "1", emailAddresses: [{ address: "X@ex.fr" }] };
    const f2: ContactGraph = { id: "2", emailAddresses: [{ address: "x@ex.fr" }, { address: "y@ex.fr" }] };
    const i = indexerContacts([f1, f2]);
    expect(i.get("x@ex.fr")).toEqual([f1, f2]);
    expect(i.get("y@ex.fr")).toEqual([f2]);
  });

  const fiche: ContactGraph = {
    id: "1", givenName: "Jeanne", surname: "DUPONT", companyName: "BET EXEMPLE", jobTitle: "",
    mobilePhone: "", businessPhones: [], emailAddresses: [{ address: "jeanne.dupont@bet-exemple.fr" }],
  };

  it("propose les mises à jour des contacts connus et ignore les fiches déjà à jour", () => {
    const { propositions, expediteurs } = construirePropositions(
      [
        m("jeanne.dupont@bet-exemple.fr", "Jeanne DUPONT", "2026-10-20T10:00:00Z", sig("Jeanne DUPONT", "Cheffe de projet", "06 11 22 33 44")),
        m("collegue@mon-entreprise.fr", "Collègue", "2026-10-21T10:00:00Z", sig("Paul MARTIN", "Architecte", "06 00 00 00 00")),
        m("noreply@service.fr", "Service", "2026-10-22T10:00:00Z", "Notification"),
      ],
      [fiche],
      { domainesInternes: ["mon-entreprise.fr"], inclureInconnus: false },
    );
    expect(expediteurs).toBe(1);
    expect(propositions).toHaveLength(1);
    expect(propositions[0].lignes.find((l) => l.champ === "jobTitle")?.propose).toBe("Cheffe de projet");
    expect(propositions[0].lignes.find((l) => l.champ === "mobilePhone")?.propose).toBe("+33 6 11 22 33 44");

    const aJour = construirePropositions(
      [m("jeanne.dupont@bet-exemple.fr", "Jeanne DUPONT", "2026-10-20T10:00:00Z", "Merci.\nJeanne DUPONT")],
      [fiche],
      { domainesInternes: [], inclureInconnus: false },
    );
    expect(aJour.propositions).toHaveLength(0);
  });

  it("n'inclut les inconnus que sur demande, et seulement avec une signature nette", () => {
    const messages = [
      m("paul.durand@exemple.fr", "Paul DURAND", "2026-10-20T10:00:00Z", sig("Paul DURAND", "Conducteur de travaux", "07 11 22 33 44")),
      m("info@lettre.fr", "La Lettre", "2026-10-20T10:00:00Z", "Découvrez nos offres\n01 23 45 67 89"),
    ];
    expect(construirePropositions(messages, [], { domainesInternes: [], inclureInconnus: false }).propositions).toHaveLength(0);
    const r = construirePropositions(messages, [], { domainesInternes: [], inclureInconnus: true });
    expect(r.propositions.map((p) => p.expediteur.email)).toEqual(["paul.durand@exemple.fr"]);
  });

  it("reconnaît les listes de diffusion par leurs en-têtes", () => {
    expect(entetesDeListe([{ name: "List-Unsubscribe", value: "<mailto:x@ex.fr>" }])).toBe(true);
    expect(entetesDeListe([{ name: "List-Id", value: "club.ex.fr" }])).toBe(true);
    expect(entetesDeListe([{ name: "Precedence", value: "bulk" }])).toBe(true);
    expect(entetesDeListe([{ name: "Auto-Submitted", value: "no" }])).toBe(false);
    expect(entetesDeListe([{ name: "Received", value: "from x" }, { name: "Subject", value: "List-Id" }])).toBe(false);
    expect(entetesDeListe(undefined)).toBe(false);
  });

  it("reconnaît les listes par l'adresse, le nom ou un lien de désinscription", () => {
    const base = m("jeanne.dupont@bet-exemple.fr", "Jeanne DUPONT", "2026-10-20T10:00:00Z", "Merci.\nJeanne DUPONT");
    expect(estListeDeDiffusion(base)).toBe(false);
    expect(estListeDeDiffusion({ ...base, liste: true })).toBe(true);
    expect(estListeDeDiffusion({ ...base, expediteur: { email: "newsletter@ex.fr", name: "Ex" } })).toBe(true);
    expect(estListeDeDiffusion({ ...base, expediteur: { email: "club@ex.fr", name: "Jeanne DUPONT via Club" } })).toBe(true);
    expect(estListeDeDiffusion({ ...base, texte: "Actualités.\nSe désinscrire" })).toBe(true);
    expect(estListeDeDiffusion({ ...base, expediteur: { email: "nicolas.newsome@ex.fr", name: "Nicolas NEWSOME" } })).toBe(false);
  });

  it("écarte les listes et retombe sur le dernier e-mail direct de la personne", () => {
    const direct = m("jeanne.dupont@bet-exemple.fr", "Jeanne DUPONT", "2026-10-10T10:00:00Z", sig("Jeanne DUPONT", "Cheffe de projet", "06 11 22 33 44"));
    const viaListe = { ...m("jeanne.dupont@bet-exemple.fr", "Jeanne DUPONT", "2026-10-25T10:00:00Z", sig("Jeanne DUPONT", "Présidente du club", "06 99 99 99 99")), liste: true };
    const r = construirePropositions([viaListe, direct], [fiche], { domainesInternes: [], inclureInconnus: false });
    expect(r.listes).toBe(1);
    expect(r.propositions[0].lignes.find((l) => l.champ === "jobTitle")?.propose).toBe("Cheffe de projet");
  });
});
