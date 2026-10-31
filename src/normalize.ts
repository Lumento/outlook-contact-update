// Règles de mise en forme des fiches contacts.

/** Nom de famille : toujours entièrement en majuscules. */
export function nomFamille(v: string | null | undefined): string | null {
  const t = propre(v);
  return t ? t.toLocaleUpperCase("fr-FR") : null;
}

/** Société : en majuscules, comme dans les fiches existantes. */
export function societe(v: string | null | undefined): string | null {
  const t = propre(v);
  return t ? t.toLocaleUpperCase("fr-FR") : null;
}

/** Prénom : majuscule initiale à chaque partie (Jean-Pierre, Marie Claire). */
export function prenom(v: string | null | undefined): string | null {
  const t = propre(v);
  if (!t) return null;
  return t
    .toLocaleLowerCase("fr-FR")
    .replace(/(^|[\s-])(\p{L})/gu, (_m, sep: string, l: string) => sep + l.toLocaleUpperCase("fr-FR"));
}

/** Service : jamais le rôle « Architecte associé ». */
export function service(v: string | null | undefined): string | null {
  const t = propre(v);
  if (!t) return null;
  if (/architecte\s+associ/i.test(t)) return null;
  return t;
}

export function propre(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

/** Chiffres d'un numéro, avec +33 ramené au format national. */
export function chiffres(tel: string): string {
  const s = tel.trim();
  // « +33 (0)6 … » : le 0 entre parenthèses ne se compose pas
  let d = s.replace(/\(0\)/g, "").replace(/\D/g, "");
  if (s.startsWith("+33") || s.startsWith("0033")) {
    d = "0" + d.replace(/^0{0,2}33/, "");
  }
  return d;
}

/** Deux numéros sont identiques si leurs 9 derniers chiffres le sont. */
export function memeNumero(a: string, b: string): boolean {
  const x = chiffres(a);
  const y = chiffres(b);
  if (x.length < 9 || y.length < 9) return x === y && x !== "";
  return x.slice(-9) === y.slice(-9);
}

/** Format international des numéros français : « +33 6 12 34 56 78 ». Les autres restent tels quels. */
export function formatTelephone(tel: string | null | undefined): string | null {
  const t = propre(tel);
  if (!t) return null;
  const d = chiffres(t);
  if (/^0\d{9}$/.test(d)) return `+33 ${d[1]} ${d.slice(2).replace(/(\d{2})(?=\d)/g, "$1 ")}`;
  return t;
}

export type TypeTelephone = "mobile" | "professionnel";

/** 06 et 07 : mobile. 01 à 05 et 09 : professionnel. */
export function typeTelephone(tel: string): TypeTelephone | null {
  const d = chiffres(tel);
  if (/^0[67]\d{8}$/.test(d)) return "mobile";
  if (/^0[1-59]\d{8}$/.test(d)) return "professionnel";
  return null;
}
