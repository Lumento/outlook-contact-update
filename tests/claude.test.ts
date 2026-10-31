import { describe, expect, it } from "vitest";
import { lireReponse, requete } from "../src/claude";

describe("option Claude", () => {
  it("impose une sortie structurée et n'envoie que le fragment", () => {
    const r = requete({ name: "Jeanne DUPONT", email: "jd@exemple.fr" }, "Jeanne DUPONT\nCheffe de projet");
    expect(r.tool_choice).toEqual({ type: "tool", name: "enregistrer_signature" });
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0].content).toContain("Cheffe de projet");
  });

  it("limite le texte envoyé à 4 000 caractères", () => {
    const r = requete({ name: "X", email: "x@exemple.fr" }, "a".repeat(10000));
    expect(r.messages[0].content.length).toBeLessThan(4200);
  });

  it("nettoie la réponse et ignore les champs inattendus", () => {
    const s = lireReponse({
      content: [
        { type: "text", text: "ok" },
        { type: "tool_use", name: "enregistrer_signature", input: { found: true, confidence: "haute", givenName: " Jeanne ", department: "", autre: "x" } },
      ],
    });
    expect(s.givenName).toBe("Jeanne");
    expect(s.department).toBeNull();
    expect("autre" in s).toBe(false);
  });

  it("ramène les valeurs douteuses au plus prudent", () => {
    const s = lireReponse({ content: [{ type: "tool_use", name: "enregistrer_signature", input: { found: "oui", confidence: "max" } }] });
    expect(s.found).toBe(false);
    expect(s.confidence).toBe("basse");
  });

  it("refuse une réponse sans résultat", () => {
    expect(() => lireReponse({ content: [{ type: "text", text: "rien" }] })).toThrow();
  });
});
