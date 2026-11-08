"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoonProvider = void 0;
const noonProduct_service_1 = require("../apify/noonProduct.service");
const productUrl_1 = require("../productUrl");
class NoonProvider {
    source = "NOON";
    noonProductService;
    constructor() {
        this.noonProductService = new noonProduct_service_1.NoonProductService();
    }
    supports(url) {
        try {
            const parsedUrl = new URL(url);
            return (parsedUrl.protocol === "https:" &&
                (0, productUrl_1.hostMatchesDomain)(parsedUrl.hostname, "noon.com"));
        }
        catch {
            return false;
        }
    }
    async fetchProduct(url) {
        if (!this.supports(url)) {
            throw new Error("L'URL fournie n'est pas une URL NOON valide.");
        }
        return this.noonProductService.fetchProduct(url);
    }
}
exports.NoonProvider = NoonProvider;
