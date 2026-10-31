import { describe, expect, it } from "vitest";
import { expediteurExclu, extraireFragment, isolerMessage } from "../src/signature";

describe("isolement du message de l'expéditeur", () => {
  it("coupe au « De : » d'une réponse Outlook", () => {
    const corps = "Bonjour,\nMerci.\n\nOlivier BERNARD\n06 55 55 55 03\n\nDe : Paul MARTIN <paul.martin@mon-entreprise.fr>\nEnvoyé : lundi\nPaul MARTIN\nArchitecte";
    const r = isolerMessage(corps);
    expect(r.coupe).toBe(true);
    expect(r.texte).toContain("Olivier BERNARD");
    expect(r.texte).not.toContain("Edouard");
  });

  it("coupe au « Le … a écrit : » et aux lignes citées", () => {
    expect(isolerMessage("Ok\nSinan\n\nLe 12 oct. 2026 à 10:00, Paul MARTIN a écrit :\nTexte").texte).toBe("Ok\nSinan\n");
    expect(isolerMessage("Ok\nSinan\n> ancien message").texte).toBe("Ok\nSinan");
  });

  it("coupe au trait de soulignement inséré par Outlook", () => {
    expect(isolerMessage("Signature\n________________________________\nDe : X").texte).toBe("Signature");
  });

  it("coupe aux messages transférés (anglais)", () => {
    expect(isolerMessage("Hi\nBob\n-----Original Message-----\nFrom: Alice").coupe).toBe(true);
    expect(isolerMessage("Hi\nBob\nOn Mon, Oct 26, 2026 Alice wrote:\nold").texte).toBe("Hi\nBob");
  });

  it("garde au plus 30 lignes non vides, en fin de message", () => {
    const corps = Array.from({ length: 50 }, (_, i) => `ligne ${i}`).join("\n\n");
    const f = extraireFragment(corps);
    expect(f.lignes).toBe(30);
    expect(f.texte.startsWith("ligne 20")).toBe(true);
    expect(f.texte.endsWith("ligne 49")).toBe(true);
  });
});

describe("robustesse face à un e-mail piégé", () => {
  it("traite en quelques millisecondes des lignes d'espaces géantes", () => {
    const piege = (" ".repeat(150_000) + "x\n").repeat(10);
    const t = performance.now();
    extraireFragment(piege);
    expect(performance.now() - t).toBeLessThan(200);
  });

  it("coupe aux transferts Apple Mail", () => {
    expect(isolerMessage("Voir ci-dessous\nDébut du message réexpédié :\nDe : Tiers").texte).toBe("Voir ci-dessous");
  });
});

describe("expéditeurs exclus", () => {
  it("exclut les adresses internes et automatiques", () => {
    expect(expediteurExclu("paul.martin@mon-entreprise.fr", ["mon-entreprise.fr"])).toMatch(/interne/);
    expect(expediteurExclu("noreply@service-exemple.fr", ["mon-entreprise.fr"])).toMatch(/automatique/);
    expect(expediteurExclu("claire.petit@bet-exemple.fr", ["mon-entreprise.fr"])).toBeNull();
  });
});

import { fragmentColle } from "../src/signature";
import { analyserLocalement } from "../src/parser";

describe("signature collée par l'utilisateur", () => {
  it("est lue telle quelle, bornée", () => {
    const f = fragmentColle("\r\n  Sophie LEROY \r\nResponsable études\r\n\r\nBET Exemple\r\nMob. 06 55 55 55 01\r\n");
    expect(f.texte).toBe("Sophie LEROY\nResponsable études\nBET Exemple\nMob. 06 55 55 55 01");
    expect(f.lignes).toBe(4);
    expect(fragmentColle("x\n".repeat(100)).lignes).toBe(30);
    expect(fragmentColle("").lignes).toBe(0);
  });

  it("une signature seule, sans le reste de l'e-mail, est reconnue", () => {
    const s = analyserLocalement(fragmentColle("Sophie LEROY\nResponsable études\nBET Exemple\nMob. 06 55 55 55 01").texte, {
      name: "Sophie Leroy", email: "sophie.leroy@bet-exemple.fr",
    });
    expect(s.found).toBe(true);
    expect(s.jobTitle).toBe("Responsable études");
    expect(s.mobilePhone).toBe("06 55 55 55 01");
    expect(s.companyName).toBe("BET Exemple");
  });
});
