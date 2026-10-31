// Construit dist/ : le volet, la page de création du manifeste et leurs ressources.
// dist/ ne contient aucune donnée d'organisation : chaque organisation génère son manifeste
// (privé) sur manifest.html. dist/ est publié tel quel (GitHub Pages ou tout hébergement HTTPS statique).
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const fichier = process.env.DEPLOY_CONFIG ?? "deploy.config.json";
const host = JSON.parse(readFileSync(fichier, "utf8")).host.replace(/\/+$/, "");
const url = new URL(host);

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/assets", { recursive: true });

await build({
  entryPoints: ["src/taskpane.ts", "src/generateur.ts"],
  bundle: true,
  format: "esm",
  splitting: true,
  outdir: "dist",
  minify: true,
  target: "es2020",
  loader: { ".xml": "text" },
  define: { __HOST__: JSON.stringify(host) },
  logLevel: "info",
});

for (const f of ["taskpane.html", "taskpane.css", "auth.html", "manifest.html"]) cpSync(`src/${f}`, `dist/${f}`);
cpSync("assets", "dist/assets", { recursive: true });
writeFileSync("dist/.nojekyll", ""); // GitHub Pages : servir les fichiers tels quels

console.log(`dist/ prêt. Création du manifeste : ${host}/manifest.html`);
console.log(`URI de redirection à déclarer dans Entra ID : brk-multihub://${url.host} et ${host}/auth.html`);
