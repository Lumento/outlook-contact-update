// Page « Créer mon manifeste » : rien n'est envoyé, le fichier est construit et téléchargé localement.

import modele from "../manifest.template.xml";
import { genererManifeste, verifier, ParametresManifeste } from "./manifeste";

declare const __HOST__: string;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function lire(): ParametresManifeste {
  return {
    host: __HOST__,
    clientId: $<HTMLInputElement>("client").value.trim(),
    tenantId: $<HTMLInputElement>("locataire").value.trim(),
    domaines: $<HTMLInputElement>("domaines").value.split(",").map((d) => d.trim()).filter(Boolean),
    organisation: $<HTMLInputElement>("organisation").value.trim(),
    ecriture: $<HTMLInputElement>("ecriture").checked,
    manifestId: $<HTMLInputElement>("identifiant").value.trim(),
  };
}

$<HTMLInputElement>("identifiant").value = crypto.randomUUID();
$("redirection-naa").textContent = `brk-multihub://${new URL(__HOST__).host}`;
$("redirection-web").textContent = `${__HOST__}/auth.html`;

$("formulaire").addEventListener("submit", (e) => {
  e.preventDefault();
  const p = lire();
  const erreurs = verifier(p);
  $("erreurs").textContent = erreurs.join(" ");
  if (erreurs.length) return;
  const fichier = new Blob([genererManifeste(modele, p)], { type: "application/xml" });
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(fichier);
  lien.download = "lumento-manifest.xml";
  lien.click();
  URL.revokeObjectURL(lien.href);
  $("fait").hidden = false;
});
