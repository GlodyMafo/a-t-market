
import { resolve4 } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import type { IncomingMessage, IncomingHttpHeaders } from "node:http";

export type ProductMarketplace = "SHEIN" | "NOON" | "1688";

export interface ProductUrlResolution {
    marketplace: ProductMarketplace;
    originalUrl: string;
    canonicalUrl: string;
    redirectCount: number;
}

export interface UrlHopResponse {
    statusCode: number;
    headers: IncomingHttpHeaders;
}

export interface UrlResolverTransport {
    request(
        url: URL,
        timeoutMs: number,
        maxResponseBytes: number
    ): Promise<UrlHopResponse>;
}

export interface ProductUrlResolverOptions {
    transport?: UrlResolverTransport;
    maxRedirects?: number;
    timeoutMs?: number;
    maxResponseBytes?: number;
}

export class ProductUrlResolverError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ProductUrlResolverError";
    }
}

const MAX_URL_LENGTH = 4096;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESPONSE_BYTES = 16 * 1024;

const MARKETPLACE_ROOTS: Record<ProductMarketplace, string> = {
    SHEIN: "shein.com",
    NOON: "noon.com",
    "1688": "1688.com",
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function normalizeHostname(hostname: string): string {
    return hostname.toLowerCase().replace(/\.$/, "");
}

function hostMatchesDomain(hostname: string, domain: string): boolean {
    const host = normalizeHostname(hostname);
    return host === domain || host.endsWith(`.${domain}`);
}

function detectMarketplace(hostname: string): ProductMarketplace | null {
    const host = normalizeHostname(hostname);

    for (const [marketplace, root] of Object.entries(MARKETPLACE_ROOTS)) {
        if (hostMatchesDomain(host, root)) {
            return marketplace as ProductMarketplace;
        }
    }

    return null;
}

function isShortLink(hostname: string, marketplace: ProductMarketplace): boolean {
    const host = normalizeHostname(hostname);

    if (marketplace === "SHEIN") {
        return host === "onelink.shein.com";
    }

    if (marketplace === "1688") {
        return host === "qr.1688.com";
    }

    return false;
}

/**
 * Valide le lien initial sans effectuer de requête réseau.
 * Cette fonction ne remplace pas parseSupportedProductUrl().
 */
export function inspectProductUrl(raw: unknown): {
    marketplace: ProductMarketplace;
    url: URL;
    isShortLink: boolean;
} {
    if (typeof raw !== "string" || raw.trim().length === 0) {
        throw new ProductUrlResolverError("URL du produit invalide.");
    }

    const input = raw.trim();

    if (input.length > MAX_URL_LENGTH) {
        throw new ProductUrlResolverError("URL du produit trop longue.");
    }

    let url: URL;

    try {
        url = new URL(input);
    } catch {
        throw new ProductUrlResolverError("URL du produit invalide.");
    }

    if (url.protocol !== "https:") {
        throw new ProductUrlResolverError(
            "Les liens produits doivent utiliser HTTPS."
        );
    }

    if (url.username || url.password) {
        throw new ProductUrlResolverError(
            "Les identifiants dans une URL sont interdits."
        );
    }

    if (url.port && url.port !== "443") {
        throw new ProductUrlResolverError("Port réseau non autorisé.");
    }

    const marketplace = detectMarketplace(url.hostname);

    if (!marketplace) {
        throw new ProductUrlResolverError(
            "Cette marketplace n'est pas encore prise en charge."
        );
    }

    url.hash = "";

    return {
        marketplace,
        url,
        isShortLink: isShortLink(url.hostname, marketplace),
    };
}

function ipv4ToNumber(address: string): number | null {
    if (isIP(address) !== 4) return null;

    const parts = address.split(".");
    if (parts.length !== 4) return null;

    const octets = parts.map(Number);

    if (
        octets.some(
            (octet) =>
                !Number.isInteger(octet) ||
                octet < 0 ||
                octet > 255
        )
    ) {
        return null;
    }

    return (
        ((octets[0] << 24) >>> 0) +
        (octets[1] << 16) +
        (octets[2] << 8) +
        octets[3]
    ) >>> 0;
}

function isInCidr(
    address: number,
    network: string,
    prefix: number
): boolean {
    const base = ipv4ToNumber(network);

    if (base === null) return true;

    const mask =
        prefix === 0
            ? 0
            : (0xffffffff << (32 - prefix)) >>> 0;

    return (address & mask) === (base & mask);
}

/**
 * Politique conservatrice :
 * seules les IPv4 publiques sont autorisées.
 * Les plages spéciales et réservées sont bloquées.
 */
function isPublicIpv4(address: string): boolean {
    const numeric = ipv4ToNumber(address);

    if (numeric === null) return false;

    const blockedRanges: Array<[string, number]> = [
        ["0.0.0.0", 8],
        ["10.0.0.0", 8],
        ["100.64.0.0", 10],
        ["127.0.0.0", 8],
        ["169.254.0.0", 16],
        ["172.16.0.0", 12],
        ["192.0.0.0", 24],
        ["192.0.2.0", 24],
        ["192.88.99.0", 24],
        ["192.168.0.0", 16],
        ["198.18.0.0", 15],
        ["198.51.100.0", 24],
        ["203.0.113.0", 24],
        ["224.0.0.0", 4],
        ["240.0.0.0", 4],
    ];

    return !blockedRanges.some(([network, prefix]) =>
        isInCidr(numeric, network, prefix)
    );
}

/**
 * Résout uniquement des IPv4 et vérifie toutes les réponses.
 * La connexion utilisera ensuite une adresse vérifiée et épinglée.
 */
async function resolvePublicIpv4(hostname: string): Promise<string> {
    if (isIP(hostname) !== 0) {
        throw new ProductUrlResolverError(
            "Les adresses IP directes ne sont pas autorisées."
        );
    }

    let addresses: string[];

    try {
        addresses = await resolve4(hostname);
    } catch {
        throw new ProductUrlResolverError(
            "Impossible de résoudre le domaine de destination."
        );
    }

    if (
        addresses.length === 0 ||
        addresses.some((address) => !isPublicIpv4(address))
    ) {
        throw new ProductUrlResolverError(
            "Le domaine pointe vers une adresse IP non autorisée."
        );
    }

    return addresses[0];
}

const defaultTransport: UrlResolverTransport = {
    async request(
        url: URL,
        timeoutMs: number,
        maxResponseBytes: number
    ): Promise<UrlHopResponse> {
        const pinnedIp = await resolvePublicIpv4(url.hostname);

        return new Promise((resolve, reject) => {
            let settled = false;
            let receivedBytes = 0;

            const fail = (error: Error) => {
                if (settled) return;
                settled = true;
                reject(error);
            };



            const req = httpsRequest(
                {
                    protocol: "https:",
                    hostname: url.hostname,
                    port: 443,
                    path: `${url.pathname}${url.search}`,
                    method: "GET",
                    servername: url.hostname,
                    lookup: (_hostname, _options, callback) => {
                        callback(null, pinnedIp, 4);
                    },
                    headers: {
                        "User-Agent": "A&T-Market-LinkResolver/1.0",
                        Accept: "text/html,application/xhtml+xml",
                    },
                },
                (res: IncomingMessage) => {
                    res.on("data", (chunk: Buffer) => {
                        receivedBytes += chunk.length;

                        if (receivedBytes > maxResponseBytes) {
                            req.destroy(
                                new ProductUrlResolverError(
                                    "Réponse trop volumineuse pendant la résolution."
                                )
                            );
                        }
                    });

                    res.on("end", () => {
                        if (settled) return;
                        settled = true;

                        resolve({
                            statusCode: res.statusCode ?? 0,
                            headers: res.headers,
                        });
                    });

                    res.on("error", fail);
                    res.resume();
                }
            );

            req.setTimeout(timeoutMs, () => {
                req.destroy(
                    new ProductUrlResolverError(
                        "Délai dépassé pendant la résolution du lien."
                    )
                );
            });

            req.on("error", fail);
            req.end();
        });
    },
};

export class ProductUrlResolver {
    private readonly transport: UrlResolverTransport;
    private readonly maxRedirects: number;
    private readonly timeoutMs: number;
    private readonly maxResponseBytes: number;

    constructor(options: ProductUrlResolverOptions = {}) {
        this.transport = options.transport ?? defaultTransport;
        this.maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.maxResponseBytes =
            options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    }

    async resolve(raw: unknown): Promise<ProductUrlResolution> {
        const inspected = inspectProductUrl(raw);
        const originalUrl = inspected.url.toString();
        const marketplace = inspected.marketplace;

        let current = inspected.url;
        let redirectCount = 0;

        while (true) {
            const currentMarketplace = detectMarketplace(current.hostname);

            if (currentMarketplace !== marketplace) {
                throw new ProductUrlResolverError(
                    "La redirection sort de la marketplace d'origine."
                );
            }

            const response = await this.transport.request(
                current,
                this.timeoutMs,
                this.maxResponseBytes
            );

            if (response.statusCode >= 200 && response.statusCode < 300) {
                return {
                    marketplace,
                    originalUrl,
                    canonicalUrl: current.toString(),
                    redirectCount,
                };
            }

            if (!REDIRECT_STATUSES.has(response.statusCode)) {
                throw new ProductUrlResolverError(
                    `Réponse HTTP non valide (${response.statusCode}).`
                );
            }

            if (redirectCount >= this.maxRedirects) {
                throw new ProductUrlResolverError(
                    "Nombre maximal de redirections dépassé."
                );
            }

            const location = response.headers.location;

            if (!location) {
                throw new ProductUrlResolverError(
                    "Redirection reçue sans destination."
                );
            }

            let next: URL;

            try {
                next = new URL(location, current);
            } catch {
                throw new ProductUrlResolverError("Redirection invalide.");
            }

            if (next.protocol !== "https:") {
                throw new ProductUrlResolverError(
                    "Une redirection non HTTPS a été bloquée."
                );
            }

            if (next.username || next.password) {
                throw new ProductUrlResolverError(
                    "Identifiants interdits dans une redirection."
                );
            }

            if (next.port && next.port !== "443") {
                throw new ProductUrlResolverError(
                    "Port interdit dans une redirection."
                );
            }

            const nextMarketplace = detectMarketplace(next.hostname);

            if (nextMarketplace !== marketplace) {
                throw new ProductUrlResolverError(
                    "La redirection mène vers un domaine externe ou une autre marketplace."
                );
            }

            next.hash = "";
            current = next;
            redirectCount += 1;
        }
    }
}

const defaultProductUrlResolver = new ProductUrlResolver();

export async function resolveProductUrl(raw: unknown): Promise<{
    marketplace: ProductMarketplace;
    originalUrl: string;
    canonicalUrl: string;
}> {
    const result = await defaultProductUrlResolver.resolve(raw);

    return {
        marketplace: result.marketplace,
        originalUrl: result.originalUrl,
        canonicalUrl: result.canonicalUrl,
    };
}
