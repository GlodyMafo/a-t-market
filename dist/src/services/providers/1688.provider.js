"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Product1688Provider = void 0;
const _1688Product_service_1 = require("../apify/1688Product.service");
const productUrl_1 = require("../productUrl");
class Product1688Provider {
    source = "1688";
    product1688Service;
    constructor() {
        this.product1688Service = new _1688Product_service_1.Product1688Service();
    }
    supports(url) {
        try {
            const parsedUrl = (0, productUrl_1.parseSupportedProductUrl)(url);
            return (parsedUrl.protocol === "https:" &&
                parsedUrl.hostname.toLowerCase() === "detail.1688.com");
        }
        catch {
            return false;
        }
    }
    async fetchProduct(url) {
        if (!this.supports(url)) {
            throw new Error("L'URL fournie n'est pas une URL de fiche produit 1688 valide.");
        }
        return this.product1688Service.fetchProduct(url);
    }
}
exports.Product1688Provider = Product1688Provider;
