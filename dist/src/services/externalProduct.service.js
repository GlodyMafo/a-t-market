"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExternalProductService = void 0;
const shein_provider_1 = require("./providers/shein.provider");
const noon_provider_1 = require("./providers/noon.provider");
const _1688_provider_1 = require("./providers/1688.provider");
const productUrl_1 = require("./productUrl");
const productUrlResolver_1 = require("./productUrlResolver");
class ExternalProductService {
    providers;
    constructor() {
        this.providers = [
            new shein_provider_1.SheinProvider(),
            new noon_provider_1.NoonProvider(),
            new _1688_provider_1.Product1688Provider(),
        ];
    }
    /**
     * Vérifie si un provider existe pour une marketplace.
     * Cette vérification ne déclenche aucune extraction.
     */
    supportsMarketplace(marketplace) {
        return this.providers.some((provider) => provider.source === marketplace);
    }
    /**
     * Extraction destinée aux appels directs de l'API.
     * Les liens courts sont résolus ici si nécessaire.
     */
    async fetchProduct(url) {
        const inspected = (0, productUrlResolver_1.inspectProductUrl)(url);
        if (!this.supportsMarketplace(inspected.marketplace)) {
            throw new Error(`Aucun fournisseur n'est encore disponible pour ${inspected.marketplace}.`);
        }
        let canonicalUrl = inspected.url.href;
        if (inspected.isShortLink) {
            const resolved = await (0, productUrlResolver_1.resolveProductUrl)(url);
            canonicalUrl = resolved.canonicalUrl;
        }
        return this.fetchCanonicalProduct(canonicalUrl);
    }
    /**
     * Extraction d'une URL déjà résolue et validée.
     * Cette méthode ne relance jamais le résolveur.
     */
    async fetchCanonicalProduct(url) {
        const parsedUrl = (0, productUrl_1.parseSupportedProductUrl)(url);
        const canonicalUrl = parsedUrl.href;
        const provider = this.providers.find((item) => item.supports(canonicalUrl));
        if (!provider) {
            throw new Error("Aucun fournisseur n'est disponible pour ce produit.");
        }
        console.log(`[External Product] Provider sélectionné : ${provider.source}`);
        return provider.fetchProduct(canonicalUrl);
    }
}
exports.ExternalProductService = ExternalProductService;
