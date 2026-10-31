import { describe, expect, it } from "vitest";
import { chiffres, formatTelephone, memeNumero, nomFamille, prenom, service, societe, typeTelephone } from "../src/normalize";
import { comparer, construireMiseAJour, fusionner } from "../src/diff";
import { ContactGraph, SignatureExtraite } from "../src/types";

const sig = (p: Partial<SignatureExtraite>): SignatureExtraite => ({
  found: true, confidence: "haute", givenName: null, surname: null, companyName: null, jobTitle: null,
  department: null, mobilePhone: null, businessPhone: null, email: null, ...p,
});
const exp = { name: "X", email: "x@exemple.fr" };

describe("mise en forme", () => {
  it("met les noms de famille et les sociétés en majuscules", () => {
    expect(nomFamille("Moreau")).toBe("MOREAU");
    expect(nomFamille("  de la Fontaine ")).toBe("DE LA FONTAINE");
    expect(societe("Atelier Exemple")).toBe("ATELIER EXEMPLE");
  });
  it("met une majuscule initiale aux prénoms composés", () => {
    expect(prenom("JEAN-PIERRE")).toBe("Jean-Pierre");
    expect(prenom("stéphanie")).toBe("Stéphanie");
  });
  it("retire « Architecte associé » du service", () => {
    expect(service("Architecte associé - Agence")).toBeNull();
    expect(service("BE Restauration collective")).toBe("BE Restauration collective");
  });
});

describe("téléphones", () => {
  it("ramène +33 au format national", () => {
    expect(chiffres("+33 6 30 26 44 31")).toBe("0630264431");
    expect(chiffres("+33 (0)6 10 47 71 15")).toBe("0610477115");
    expect(chiffres("+33 776040276")).toBe("0776040276");
  });
  it("reconnaît un même numéro écrit autrement", () => {
    expect(memeNumero("0619389796", "06 19 38 97 96")).toBe(true);
    expect(memeNumero("+33 6 19 38 97 96", "06.19.38.97.96")).toBe(true);
    expect(memeNumero("06 19 38 97 96", "06 19 38 97 97")).toBe(false);
  });
  it("écrit les numéros français au format international +33", () => {
    expect(formatTelephone("0980871038")).toBe("+33 9 80 87 10 38");
    expect(formatTelephone("06.12.34.56.78")).toBe("+33 6 12 34 56 78");
    expect(formatTelephone("+33 (0)7 85 66 88 53")).toBe("+33 7 85 66 88 53");
    expect(formatTelephone("+41 22 123 45 67")).toBe("+41 22 123 45 67");
  });
  it("classe 06/07 en mobile et 01-05/09 en professionnel", () => {
    expect(typeTelephone("07 61 40 91 06")).toBe("mobile");
    expect(typeTelephone("01 47 07 06 05")).toBe("professionnel");
    expect(typeTelephone("09 80 87 10 38")).toBe("professionnel");
  });
});

describe("comparaison avec la fiche (cas d'acceptation)", () => {
  const fiche: ContactGraph = {
    id: "1", givenName: "Sophie", surname: "LEROY", companyName: "BET EXEMPLE", jobTitle: "Directrice générale",
    department: "", mobilePhone: "06 55 55 55 01", businessPhones: ["04 55 55 55 02"],
    emailAddresses: [{ address: "sophie.leroy@bet-exemple.fr" }],
  };

  it("cas 1 : un champ vide est proposé et coché", () => {
    const l = comparer(fiche, sig({ department: "BE Restauration collective" }), exp).find((x) => x.champ === "department")!;
    expect(l.statut).toBe("completer");
    expect(l.cocheParDefaut).toBe(true);
  });

  it("cas 2 : un poste différent est signalé mais décoché", () => {
    const l = comparer(fiche, sig({ jobTitle: "Directrice" }), exp).find((x) => x.champ === "jobTitle")!;
    expect(l.statut).toBe("conflit");
    expect(l.cocheParDefaut).toBe(false);
  });

  it("cas 3 : un nouveau numéro fixe s'ajoute sans retirer l'ancien", () => {
    const lignes = comparer(fiche, sig({ businessPhone: "01 40 00 00 00" }), exp);
    const l = lignes.find((x) => x.champ === "businessPhones")!;
    expect(l.statut).toBe("ajouter");
    const { ajouts } = construireMiseAJour(lignes, new Set(["businessPhones"]));
    expect(fusionner(fiche, ajouts).corps.businessPhones).toEqual(["04 55 55 55 02", "+33 1 40 00 00 00"]);
  });

  it("cas 3 bis : un mobile différent n'est jamais remplacé par défaut", () => {
    const l = comparer(fiche, sig({ mobilePhone: "06 99 99 99 99" }), exp).find((x) => x.champ === "mobilePhone")!;
    expect(l.statut).toBe("conflit");
    expect(l.cocheParDefaut).toBe(false);
  });

  it("cas 4 : un même numéro écrit autrement n'est pas proposé", () => {
    const l = comparer(fiche, sig({ mobilePhone: "0655555501" }), exp).find((x) => x.champ === "mobilePhone")!;
    expect(l.statut).toBe("identique");
  });

  it("cas 4 bis : un mobile donné comme ligne fixe est reclassé", () => {
    const lignes = comparer({ ...fiche, mobilePhone: "" }, sig({ businessPhone: "07 61 40 91 06" }), exp);
    expect(lignes.find((x) => x.champ === "mobilePhone")?.propose).toBe("+33 7 61 40 91 06");
    expect(lignes.find((x) => x.champ === "businessPhones")).toBeUndefined();
  });

  it("cas 6 : sans fiche, tout est à compléter et le nom est en majuscules", () => {
    const lignes = comparer(null, sig({ givenName: "lucas", surname: "Moreau", email: "lucas.moreau@exemple.fr" }), exp);
    expect(lignes.find((x) => x.champ === "surname")?.propose).toBe("MOREAU");
    expect(lignes.find((x) => x.champ === "givenName")?.propose).toBe("Lucas");
    expect(lignes.every((x) => x.statut !== "conflit")).toBe(true);
  });

  it("propose la mise en majuscules d'un nom existant en minuscules", () => {
    const l = comparer({ ...fiche, surname: "Leroy" }, sig({ surname: "Leroy" }), exp).find((x) => x.champ === "surname")!;
    expect(l.statut).toBe("conflit");
    expect(l.propose).toBe("LEROY");
    expect(l.cocheParDefaut).toBe(true);
  });

  it("lecture incertaine : rien n'est coché", () => {
    const lignes = comparer(null, sig({ confidence: "basse", surname: "X", jobTitle: "Y" }), exp);
    expect(lignes.some((x) => x.cocheParDefaut)).toBe(false);
  });

  it("n'écrit que les champs cochés et jamais une ligne identique", () => {
    const lignes = comparer(fiche, sig({ jobTitle: "Directrice", department: "BE", surname: "LEROY" }), exp);
    expect(construireMiseAJour(lignes, new Set(["department", "surname"])).ajouts).toEqual({ department: "BE" });
  });
});

describe("sécurité des écritures", () => {
  const fiche: ContactGraph = {
    id: "1", surname: "LEROY", jobTitle: "Directrice générale", mobilePhone: "",
    businessPhones: ["04 55 55 55 02"], emailAddresses: [{ address: "sophie.leroy@bet-exemple.fr" }],
  };
  const envoi = { name: "Sophie LEROY", email: "sophie.leroy@bet-exemple.fr" };

  it("une adresse d'un autre domaine lue dans la signature n'est jamais cochée d'office", () => {
    const l = comparer(fiche, sig({ email: "boss@attaquant.fr" }), envoi).find((x) => x.id === "emailSignature")!;
    expect(l.statut).toBe("ajouter");
    expect(l.cocheParDefaut).toBe(false);
    expect(l.remarque).toMatch(/autre domaine/);
  });

  it("un nouveau contact garde toujours l'adresse d'envoi, cochée", () => {
    const lignes = comparer(null, sig({ surname: "X", email: "autre@ailleurs.fr" }), { name: "X", email: "x@exemple.fr" });
    const envoiLigne = lignes.find((l) => l.id === "emailAddresses")!;
    expect(envoiLigne.propose).toBe("x@exemple.fr");
    expect(envoiLigne.cocheParDefaut).toBe(true);
    const tout = construireMiseAJour(lignes, new Set(lignes.map((l) => l.id))).ajouts;
    expect(tout.emailAddresses?.map((e) => e.address)).toEqual(["x@exemple.fr", "autre@ailleurs.fr"]);
  });

  it("une valeur vidée par l'utilisateur n'efface rien", () => {
    const lignes = comparer(fiche, sig({ jobTitle: "Directrice" }), envoi).map((l) => ({ ...l, propose: "   " }));
    expect(construireMiseAJour(lignes, new Set(["jobTitle"])).ajouts).toEqual({});
  });

  it("un e-mail ou un numéro invalide n'est pas écrit", () => {
    const lignes = comparer(null, sig({ businessPhone: "01 40 00 00 00" }), envoi).map((l) =>
      l.champ === "businessPhones" ? { ...l, propose: "appelez-moi" } : l.champ === "emailAddresses" ? { ...l, propose: "pas-une-adresse" } : l,
    );
    const r = construireMiseAJour(lignes, new Set(["businessPhones", "emailAddresses"]));
    expect(r.ajouts).toEqual({});
    expect(r.refus).toHaveLength(2);
  });

  it("ignore un numéro de signature qui n'en est pas un", () => {
    expect(comparer(fiche, sig({ mobilePhone: "rappelez-moi" }), envoi).find((x) => x.champ === "mobilePhone")).toBeUndefined();
  });

  it("la fusion part de la fiche relue et respecte les limites d'Outlook sans perdre les autres champs", () => {
    const relue: ContactGraph = { ...fiche, businessPhones: ["04 55 55 55 02", "01 99 99 99 99"] };
    const r = fusionner(relue, { jobTitle: "Directrice", businessPhones: ["+33 1 40 00 00 00"] });
    expect(r.corps).toEqual({ jobTitle: "Directrice" });
    expect(r.refus[0]).toMatch(/déjà 2/);
    expect(fusionner(relue, { businessPhones: ["0455555502"] }).corps).toEqual({});
    const pleine: ContactGraph = { emailAddresses: [{ address: "a@x.fr" }, { address: "b@x.fr" }, { address: "c@x.fr" }] };
    expect(fusionner(pleine, { emailAddresses: [{ address: "d@x.fr" }] }).refus[0]).toMatch(/déjà 3/);
  });

  it("une fiche pleine ne coche pas d'office un ajout impossible", () => {
    const pleine: ContactGraph = { ...fiche, businessPhones: ["04 55 55 55 02", "01 99 99 99 99"] };
    const l = comparer(pleine, sig({ businessPhone: "01 40 00 00 00" }), envoi).find((x) => x.id === "businessPhones")!;
    expect(l.cocheParDefaut).toBe(false);
    expect(l.remarque).toMatch(/libérez/);
  });
});
