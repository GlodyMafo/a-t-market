"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractExternalProductController = extractExternalProductController;
const externalProduct_service_1 = require("../services/externalProduct.service");
const externalProductService = new externalProduct_service_1.ExternalProductService();
async function extractExternalProductController(req, res) {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({
                success: false,
                message: "L'URL du produit est obligatoire.",
            });
        }
        const product = await externalProductService.fetchProduct(url);
        return res.status(200).json({
            success: true,
            data: product,
        });
    }
    catch (error) {
        console.error("[EXTERNAL PRODUCT CONTROLLER] Erreur :", error);
        return res.status(400).json({
            success: false,
            message: error?.message ??
                "Impossible d'extraire le produit.",
        });
    }
}
