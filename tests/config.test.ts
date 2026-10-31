import { describe, expect, it } from "vitest";
import { lireConfiguration } from "../src/config";
import { genererManifeste, verifier } from "../src/manifeste";
import vraiModele from "../manifest.template.xml?raw";

const C = "11111111-2222-3333-4444-555555555555";
const T = "66666666-7777-8888-9999-aaaaaaaaaaaa";
const M = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
const HOST = "https://exemple.github.io/lumento";

describe("lireConfiguration", () => {
  it("lit les paramètres du manifeste", () => {
    const c = lireConfiguration(`?c=${C}&t=${T}&d=mon-entreprise.fr,filiale.fr&w=1`, HOST);
    expect(c).toMatchObject({ clientId: C, tenantId: T, internalDomains: ["mon-entreprise.fr", "filiale.fr"], ecriture: true });
  });
  it("rejette les valeurs invalides", () => {
    const c = lireConfiguration(`?c=pas-un-guid&t=${T}&d=<script>,ok.fr&w=oui`, HOST);
    expect(c.clientId).toBe("");
    expect(c.internalDomains).toEqual(["ok.fr"]);
    expect(c.ecriture).toBe(false);
  });
  it("sans paramètres, rien n'est configuré", () => {
    expect(lireConfiguration("", HOST)).toMatchObject({ clientId: "", tenantId: "", internalDomains: [], ecriture: false });
  });
});

describe("genererManifeste", () => {
  const p = { host: HOST + "/", clientId: C, tenantId: T, domaines: ["mon-entreprise.fr"], organisation: "Dupont & Fils", ecriture: false, manifestId: M };
  const modele = "<Id>{{MANIFEST_ID}}</Id><P>{{PROVIDER}}</P><U>{{HOST}}/taskpane.html?{{QUERY}}</U><D>{{ORIGIN}}</D>";

  it("remplit le modèle en échappant le XML", () => {
    const x = genererManifeste(modele, p);
    expect(x).toContain(`<Id>${M}</Id>`);
    expect(x).toContain("<P>Dupont &amp; Fils</P>");
    expect(x).toContain(`<U>${HOST}/taskpane.html?c=${C}&amp;t=${T}&amp;d=mon-entreprise.fr</U>`);
    expect(x).toContain("<D>https://exemple.github.io</D>");
    expect(x).not.toContain("w=1");
  });
  it("ajoute le mode écriture", () => {
    expect(genererManifeste(modele, { ...p, ecriture: true })).toContain("&amp;w=1");
  });
  it("refuse une saisie invalide", () => {
    expect(verifier({ ...p, clientId: "x", domaines: ["a b"] })).toHaveLength(2);
    expect(() => genererManifeste(modele, { ...p, organisation: " " })).toThrow();
  });
  it("le vrai modèle n'a plus de marqueur après génération", () => {
    const x = genererManifeste(vraiModele, p);
    expect(x).not.toMatch(/\{\{/);
  });
});
