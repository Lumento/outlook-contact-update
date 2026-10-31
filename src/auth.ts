// Jetons Microsoft par authentification imbriquée (NAA) : Outlook fournit le jeton
// sans nouvelle connexion. Repli sur une fenêtre de connexion seulement si une interaction est requise.

import {
  BrowserAuthError,
  createNestablePublicClientApplication,
  InteractionRequiredAuthError,
  type IPublicClientApplication,
} from "@azure/msal-browser";
import { config } from "./config";

let pca: Promise<IPublicClientApplication> | null = null;

const client = () =>
  (pca ??= createNestablePublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      redirectUri: `${config.host}/auth.html`,
    },
    // sessionStorage : les jetons ne survivent pas au volet et ne sont pas lisibles
    // par les autres sites publiés sur la même origine (github.io).
    cache: { cacheLocation: "sessionStorage" },
  }).catch((e) => {
    pca = null; // un échec d'initialisation n'est pas gardé : le prochain appel réessaie
    throw e;
  }));

const interactionRequise = (e: unknown) =>
  e instanceof InteractionRequiredAuthError || (e instanceof BrowserAuthError && e.errorCode === "no_account_error");

export async function jeton(scopes: string[]): Promise<string> {
  const app = await client();
  try {
    // Avec l'authentification imbriquée, Outlook fournit le compte même s'il n'y en a pas d'actif.
    const r = await app.acquireTokenSilent({ scopes, account: app.getActiveAccount() ?? undefined });
    app.setActiveAccount(r.account);
    return r.accessToken;
  } catch (e) {
    if (!interactionRequise(e)) throw e;
    const r = await app.acquireTokenPopup({ scopes });
    app.setActiveAccount(r.account);
    return r.accessToken;
  }
}
