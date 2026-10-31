import { describe, expect, it } from "vitest";
import { evaluerAlerte, NOTIFICATION_MAX } from "../src/alerte";
import { LigneComparaison, SignatureExtraite } from "../src/types";

const sig = (confidence: SignatureExtraite["confidence"]): SignatureExtraite => ({
  found: true, confidence, givenName: null, surname: null, companyName: null, jobTitle: null,
  department: null, mobilePhone: null, businessPhone: null, email: null,
});
const ligne = (statut: LigneComparaison["statut"]): LigneComparaison => ({
  id: "jobTitle", champ: "jobTitle", libelle: "Poste", actuel: "", propose: "X", statut, cocheParDefaut: true,
});

describe("alerte à l'ouverture d'un e-mail", () => {
  it("signale une fiche existante dès qu'un champ diffère", () => {
    const a = evaluerAlerte("Jeanne DUPONT", true, sig("moyenne"), [ligne("completer"), ligne("conflit"), ligne("identique")]);
    expect(a?.champs).toBe(2);
    expect(a?.texte).toMatch(/Jeanne DUPONT à mettre à jour : 2 champs/);
  });

  it("ne dit rien quand la fiche est à jour", () => {
    expect(evaluerAlerte("Jeanne DUPONT", true, sig("haute"), [ligne("identique")])).toBeNull();
  });

  it("n'alerte pour un inconnu que si la signature est nette", () => {
    expect(evaluerAlerte("Lettre", false, sig("moyenne"), [ligne("completer")])).toBeNull();
    expect(evaluerAlerte("Paul DURAND", false, sig("haute"), [ligne("completer")])?.nouveau).toBe(true);
  });

  it("respecte la limite de 150 caractères d'Outlook", () => {
    const a = evaluerAlerte("N".repeat(300), true, sig("haute"), [ligne("completer")]);
    expect(a!.texte.length).toBeLessThanOrEqual(NOTIFICATION_MAX);
  });
});
