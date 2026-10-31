// Signatures fictives : aucune donnée réelle dans ce dépôt public.
import { describe, expect, it } from "vitest";
import { analyserLocalement, lireNumeros, nomExpediteur } from "../src/parser";

describe("nom de l'expéditeur", () => {
  it("repère le nom en majuscules, quel que soit l'ordre", () => {
    expect(nomExpediteur("MARTIN Marc", "m.martin@exemple.fr")).toEqual({ nom: "MARTIN", prenom: "Marc" });
    expect(nomExpediteur("Jeanne DUPONT", "jd@exemple.fr")).toEqual({ nom: "DUPONT", prenom: "Jeanne" });
  });
  it("s'appuie sur l'adresse prenom.nom@ sinon", () => {
    expect(nomExpediteur("Anne-Sophie de Vries", "anne-sophie.vries@exemple.fr").nom).toBe("Vries");
    expect(nomExpediteur("", "paul.durand@exemple.fr")).toEqual({ prenom: "paul", nom: "durand" });
  });
});

describe("numéros", () => {
  it("lit le libellé avant chaque numéro d'une même ligne", () => {
    const n = lireNumeros("Tél : 01 40 00 00 00 - Mob : 06 11 22 33 44 - Fax : 01 40 00 00 01");
    expect(n.map((x) => x.type)).toEqual(["pro", "mobile", "ignore"]);
  });
  it("reconnaît les formats +33 (0)6, points et tirets", () => {
    expect(lireNumeros("+33 (0)6 12 34 56 78")[0].valeur).toBe("+33 (0)6 12 34 56 78");
    expect(lireNumeros("06.12.34.56.78")[0].valeur).toBe("06.12.34.56.78");
    expect(lireNumeros("Port. 06-12-34-56-78")[0].type).toBe("mobile");
  });
});

describe("signatures", () => {
  it("signature classique sur plusieurs lignes", () => {
    const r = analyserLocalement(
      "Ci-joint le compte rendu.\nBien cordialement,\nJeanne DUPONT\nCheffe de projet\nBET Exemple – Fluides\nMob. 06 11 22 33 44\nTél. 01 40 00 00 00\njeanne.dupont@bet-exemple.fr\nwww.bet-exemple.fr",
      { name: "Jeanne Dupont", email: "jeanne.dupont@bet-exemple.fr" },
    );
    expect(r).toMatchObject({
      found: true, confidence: "haute", givenName: "Jeanne", surname: "DUPONT",
      jobTitle: "Cheffe de projet", companyName: "BET Exemple", department: "Fluides",
      mobilePhone: "06 11 22 33 44", businessPhone: "01 40 00 00 00", email: "jeanne.dupont@bet-exemple.fr",
    });
  });

  it("nom et poste sur une ligne, adresse, standard et mentions légales ignorés", () => {
    const r = analyserLocalement(
      [
        "Cordialement",
        "Marc Martin | Directeur de travaux",
        "SOCIÉTÉ EXEMPLE SAS",
        "12 rue de la Paix, 75002 Paris",
        "Ligne directe : +33 (0)1 23 45 67 89",
        "Standard : 01 23 45 67 00",
        "Portable : +33 6 12 34 56 78",
        "Ce message et ses pièces jointes sont confidentiels et destinés exclusivement à leurs destinataires.",
      ].join("\n"),
      { name: "MARTIN Marc", email: "m.martin@societe-exemple.fr" },
    );
    expect(r.surname).toBe("Martin");
    expect(r.givenName).toBe("Marc");
    expect(r.jobTitle).toBe("Directeur de travaux");
    expect(r.companyName).toBe("SOCIÉTÉ EXEMPLE SAS");
    expect(r.businessPhone).toBe("+33 (0)1 23 45 67 89");
    expect(r.mobilePhone).toBe("+33 6 12 34 56 78");
    expect(r.note).toMatch(/01 23 45 67 00/);
  });

  it("numéro sans libellé classé selon son préfixe", () => {
    const r = analyserLocalement("Paul DURAND\nConducteur de travaux\n07 11 22 33 44", { name: "Paul Durand", email: "paul.durand@gmail.com" });
    expect(r.mobilePhone).toBe("07 11 22 33 44");
    expect(r.companyName).toBeNull();
  });

  it("service repéré par mot-clé", () => {
    const r = analyserLocalement(
      "Claire PETIT\nDirectrice de projets\nPôle lycées\nRégion Exemple\nclaire.petit@region-exemple.fr",
      { name: "Claire PETIT", email: "claire.petit@region-exemple.fr" },
    );
    expect(r.department).toBe("Pôle lycées");
    expect(r.companyName).toBe("Région Exemple");
    expect(r.jobTitle).toBe("Directrice de projets");
  });

  it("message sans signature : rien n'est proposé", () => {
    const r = analyserLocalement("Merci, à demain.", { name: "Paul Durand", email: "paul.durand@exemple.fr" });
    expect(r.found).toBe(false);
  });

  it("sans ligne de nom, la confiance est basse", () => {
    const r = analyserLocalement("Bien à vous\nService technique\n01 40 00 00 00", { name: "Paul Durand", email: "paul.durand@exemple.fr" });
    expect(r.confidence).toBe("basse");
  });
});
