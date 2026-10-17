/**
 * Sites marchands pour lesquels un fournisseur d'extraction existe réellement.
 * (On n'annonce pas un site comme "pris en charge" s'il n'a pas de fournisseur.)
 */
export const SUPPORTED_PRODUCT_DOMAINS = ["shein.com"];

/** Vrai si le nom d'hôte est exactement le domaine, ou l'un de ses sous-domaines. */
export function hostMatchesDomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Valide et normalise l'URL d'un produit externe.
 * Refuse : URL invalide, protocole autre que http(s), identifiants dans l'URL
 * (https://shein.com@evil.com), port non standard, et tout domaine non pris en charge.
 * La décision repose sur le NOM D'HÔTE analysé, jamais sur une recherche de texte.
 */
export function parseSupportedProductUrl(raw: unknown): URL {
  if (typeof raw !== "string" || raw.trim() === "" || raw.length > 2000) {
    throw new Error("URL du produit invalide.");
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("URL du produit invalide.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("L'URL doit utiliser HTTP ou HTTPS.");
  }

  if (url.username || url.password) {
    throw new Error("URL du produit invalide.");
  }

  if (url.port) {
    throw new Error("URL du produit invalide.");
  }

  const supported = SUPPORTED_PRODUCT_DOMAINS.some((domain) =>
    hostMatchesDomain(url.hostname, domain)
  );

  if (!supported) {
    throw new Error("Ce site n'est pas encore pris en charge.");
  }

  return url;
}