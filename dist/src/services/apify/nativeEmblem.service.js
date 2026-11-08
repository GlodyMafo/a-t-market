"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NativeEmblemService = void 0;
const apify_client_1 = require("apify-client");
const apifyLimits_1 = require("./apifyLimits");
const productUrl_1 = require("../productUrl");
class NativeEmblemService {
    client;
    actorId = "5BDKbqx8RGKFY2JxY";
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
        let url;
        try {
            url = new URL(productUrl);
        }
        catch {
            throw new Error("L'URL SHEIN fournie est invalide.");
        }
        if (!(0, productUrl_1.hostMatchesDomain)(url.hostname, "shein.com")) {
            throw new Error("L'URL fournie n'est pas une URL SHEIN.");
        }
        const input = {
            productUrls: [productUrl],
            maxItems: 1,
        };
        console.log("\n[Native Emblem] Recherche du produit...");
        console.log(`[Native Emblem] URL : ${productUrl}`);
        const run = await this.client
            .actor(this.actorId)
            .call(input, apifyLimits_1.APIFY_RUN_OPTIONS);
        console.log("[Native Emblem] Actor terminé.");
        const { items } = await this.client
            .dataset(run.defaultDatasetId)
            .listItems();
        if (!items || items.length === 0) {
            throw new Error("Native Emblem n'a retourné aucun produit.");
        }
        const item = items[0];
        console.log("[Native Emblem] Champs reçus :", Object.keys(item));
        console.log("[Native Emblem] Catégorie reçue :", item.category, item.categoryId);
        const goodsId = item.goodsId ?? item.id;
        if (!goodsId) {
            throw new Error("Native Emblem n'a retourné aucun goodsId.");
        }
        return {
            goodsId: String(goodsId),
            title: item.title ??
                item.name ??
                null,
            productUrl: item.productUrl ??
                item.url ??
                productUrl,
            imageUrl: item.imageUrl ??
                item.mainImage ??
                item.image ??
                null,
            images: Array.isArray(item.images)
                ? item.images
                : [],
            price: typeof item.price === "number"
                ? item.price
                : typeof item.salePrice === "number"
                    ? item.salePrice
                    : null,
            priceUsd: typeof item.priceUsd === "number"
                ? item.priceUsd
                : null,
            currency: item.currency ??
                null,
            category: item.category ??
                null,
            categoryId: item.categoryId
                ? String(item.categoryId)
                : null,
            rating: typeof item.rating === "number"
                ? item.rating
                : null,
            reviewsCount: typeof item.reviewsCount === "number"
                ? item.reviewsCount
                : typeof item.reviewCount === "number"
                    ? item.reviewCount
                    : null,
            inStock: typeof item.inStock === "boolean"
                ? item.inStock
                : null,
            raw: item,
        };
    }
}
exports.NativeEmblemService = NativeEmblemService;
