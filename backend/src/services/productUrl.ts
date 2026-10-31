export const SUPPORTED_PRODUCT_DOMAINS = [
  "shein.com",
  "noon.com",
  "1688.com",
] as const;

export type ProductMarketplace = "SHEIN" | "NOON" | "1688";

export function hostMatchesDomain(
  hostname: string,
  domain: string
): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");

  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Identifie la marketplace d'une URL directe ou d'un lien court connu.
 */
export function detectProductMarketplace(
  raw: unknown
): ProductMarketplace {
  if (
    typeof raw !== "string" ||
    raw.trim() === "" ||
    raw.length > 2000
  ) {
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

  if (url.username || url.password || url.port) {
    throw new Error("URL du produit invalide.");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");

  if (hostMatchesDomain(host, "shein.com")) {
    return "SHEIN";
  }

  if (hostMatchesDomain(host, "noon.com")) {
    return "NOON";
  }

  if (hostMatchesDomain(host, "1688.com")) {
    return "1688";
  }

  if (host === "onelink.shein.com") {
    return "SHEIN";
  }

  if (host === "qr.1688.com") {
    return "1688";
  }

  throw new Error(
    "Ce lien ne correspond à aucune marketplace prise en charge."
  );
}

/**
 * Valide une URL finale acceptée par un provider opérationnel.
 * Les liens courts ne sont pas acceptés ici.
 */
export function parseSupportedProductUrl(raw: unknown): URL {
  if (
    typeof raw !== "string" ||
    raw.trim() === "" ||
    raw.length > 2000
  ) {
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

  if (url.username || url.password || url.port) {
    throw new Error("URL du produit invalide.");
  }

  const supported = SUPPORTED_PRODUCT_DOMAINS.some((domain) =>
    hostMatchesDomain(url.hostname, domain)
  );

  if (!supported) {
    throw new Error("Ce site n'est pas encore pris en charge.");
  }

  if (hostMatchesDomain(url.hostname, "1688.com")) {
    const is1688ProductUrl =
      url.hostname.toLowerCase() === "detail.1688.com" &&
      /^\/offer\/\d+\.html$/.test(url.pathname);

    if (!is1688ProductUrl) {
      throw new Error(
        "Cette URL 1688 ne correspond pas à une fiche produit valide."
      );
    }
  }

  return url;
}
