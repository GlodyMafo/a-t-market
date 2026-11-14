"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveQuoteWeight = resolveQuoteWeight;
const prisma_1 = require("../lib/prisma");
const pricing_service_1 = require("./pricing.service");
/**
 * Poids retenu : celui lu sur la fiche du produit, sinon (uniquement si une sous-catégorie fiable est
 * fournie par le serveur lui-même) l'estimation validée du catalogue, sinon inconnu (null, jamais 0).
 */
async function resolveQuoteWeight(extractedWeightKg, subCategoryId) {
    if (typeof extractedWeightKg === "number" && extractedWeightKg > 0) {
        return { weight: (0, pricing_service_1.normalizeWeightKg)(extractedWeightKg), source: "EXTRACTED" };
    }
    if (!subCategoryId)
        return { weight: null, source: null };
    const weightCatalog = await prisma_1.prisma.weightCatalog.findUnique({ where: { subCategoryId } });
    if (weightCatalog && Number(weightCatalog.estimatedWeightKg) > 0) {
        return { weight: (0, pricing_service_1.normalizeWeightKg)(weightCatalog.estimatedWeightKg), source: "CATALOG_ESTIMATE" };
    }
    return { weight: null, source: null };
}
