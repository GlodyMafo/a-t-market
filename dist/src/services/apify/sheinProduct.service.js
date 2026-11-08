"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SheinProductService = void 0;
const apify_client_1 = require("apify-client");
const apifyLimits_1 = require("./apifyLimits");
class SheinProductService {
    client;
    actorId = "jizSZlSo9FeenLkFE";
    constructor() {
        const token = process.env.APIFY_API_TOKEN;
        if (!token) {
            throw new Error("APIFY_API_TOKEN n'est pas configuré dans les variables d'environnement.");
        }
        this.client = new apify_client_1.ApifyClient({
            token,
        });
    }
    async fetchProduct(productUrl) {
        if (!productUrl) {
            throw new Error("L'URL du produit SHEIN est obligatoire.");
        }
        console.log(`\n[Omkar SHEIN Scraper] URL reçue : ${productUrl}`);
        /*
         * Omkar Cloud attend un champ "products".
         *
         * Chaque élément peut être une URL SHEIN
         * ou un goods_id.
         *
         * Nous envoyons directement l'URL reçue.
         */
        const input = {
            products: [productUrl],
        };
        console.log("[Omkar SHEIN Scraper] Lancement de l'Actor...");
        const run = await this.client
            .actor(this.actorId)
            .call(input, apifyLimits_1.APIFY_RUN_OPTIONS);
        console.log("[Omkar SHEIN Scraper] Actor terminé.");
        const { items } = await this.client
            .dataset(run.defaultDatasetId)
            .listItems();
        if (!items || items.length === 0) {
            throw new Error("Omkar SHEIN Scraper n'a retourné aucun produit.");
        }
        console.log(`[Omkar SHEIN Scraper] ${items.length} produit(s) trouvé(s).`);
        return items[0];
    }
}
exports.SheinProductService = SheinProductService;
