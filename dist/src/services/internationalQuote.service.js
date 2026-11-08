"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PAYABLE_QUOTE_STATUSES = void 0;
exports.isQuotePayable = isQuotePayable;
exports.quoteValidUntil = quoteValidUntil;
exports.isQuoteExpired = isQuoteExpired;
exports.cleanQuoteOptions = cleanQuoteOptions;
exports.createInternationalQuote = createInternationalQuote;
exports.getUserQuotes = getUserQuotes;
const prisma_1 = require("../lib/prisma");
const pricing_service_1 = require("./pricing.service");
const quoteWeight_1 = require("./quoteWeight");
const quotes_1 = require("../config/quotes");
/** Un devis ne peut être payé que s'il est validé (automatiquement ou par un admin). */
exports.PAYABLE_QUOTE_STATUSES = ["AUTO_APPROVED", "APPROVED"];
function isQuotePayable(status) {
    return exports.PAYABLE_QUOTE_STATUSES.includes(status);
}
/** Date de fin de validité d'un prix, à partir de la date donnée. */
function quoteValidUntil(from = new Date()) {
    return new Date(from.getTime() + quotes_1.QUOTE_VALIDITY_DAYS * 24 * 3600 * 1000);
}
/**
 * Un devis est périmé à sa date de fin de validité. Un ancien devis (créé avant l'existence
 * de cette date) est considéré valable QUOTE_VALIDITY_DAYS jours après sa création.
 */
function isQuoteExpired(quote, now = new Date()) {
    const limit = quote.expiresAt ?? quoteValidUntil(quote.createdAt);
    return now.getTime() >= limit.getTime();
}
/** Texte libre du client (taille, couleur...) : nettoyé et limité à 200 caractères. */
function cleanQuoteOptions(value) {
    if (typeof value !== "string")
        return null;
    const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
    return cleaned.length > 0 ? cleaned : null;
}
async function createInternationalQuote(userId, productUrl, productName, productPrice, subCategoryId, extractedWeightKg, options, currency = "USD") {
    const settings = await prisma_1.prisma.globalSettings.findFirst();
    const subCategory = await prisma_1.prisma.subCategory.findFirst({
        where: {
            id: subCategoryId,
            isActive: true,
            category: {
                isActive: true,
            },
        },
    });
    if (!subCategory) {
        throw new Error("La sous-catégorie sélectionnée est invalide ou inactive.");
    }
    if (!settings) {
        throw new Error("Configuration système introuvable");
    }
    if (!Number.isFinite(productPrice) || productPrice <= 0) {
        throw new Error("Le prix du produit doit être valide.");
    }
    if (currency !== "USD" && currency !== "AED") {
        throw new Error("La devise du produit n'est pas prise en charge.");
    }
    let usdProductPrice = productPrice;
    let exchangeRate = null;
    let sourceProductPrice = null;
    let sourceCurrency = null;
    if (currency === "AED") {
        if (settings.aedToUsdRate === null) {
            throw new Error("Le taux de conversion AED vers USD n'est pas configuré.");
        }
        exchangeRate = Number(settings.aedToUsdRate);
        if (!Number.isFinite(exchangeRate) ||
            exchangeRate <= 0 ||
            exchangeRate > 10) {
            throw new Error("Le taux de conversion AED vers USD est invalide.");
        }
        sourceProductPrice = productPrice;
        sourceCurrency = "AED";
        usdProductPrice =
            Math.round((productPrice * exchangeRate + Number.EPSILON) * 100) / 100;
        if (!Number.isFinite(usdProductPrice) || usdProductPrice <= 0) {
            throw new Error("Le prix converti en USD est invalide.");
        }
    }
    if (extractedWeightKg !== undefined &&
        extractedWeightKg !== null &&
        (!Number.isFinite(extractedWeightKg) || extractedWeightKg <= 0)) {
        throw new Error("Le poids du produit doit être valide.");
    }
    // Poids : extrait du site, sinon estimation validée du catalogue, sinon inconnu.
    // On garde aussi la SOURCE du poids, pour savoir plus tard s'il est réel ou estimé.
    const { weight: productWeight, source: weightSource } = await (0, quoteWeight_1.resolveQuoteWeight)(extractedWeightKg, subCategoryId);
    const quote = (0, pricing_service_1.computeQuote)({
        productPrice: usdProductPrice,
        weightKg: productWeight,
        settings,
    });
    const status = quote.isProvisional ? "PENDING_REVIEW" : "AUTO_APPROVED";
    return prisma_1.prisma.internationalQuote.create({
        data: {
            userId,
            productUrl,
            productName,
            productPrice: quote.productPrice,
            sourceProductPrice,
            sourceCurrency,
            exchangeRate,
            productWeight,
            weightSource,
            currency: "USD",
            commissionRate: settings.commissionRate,
            chinaPricePerKg: settings.chinaPricePerKg,
            fixedFee: settings.fixedFee,
            shippingCost: quote.shippingCost,
            customsCost: quote.customsCost,
            commissionCost: quote.commissionCost,
            totalPrice: quote.totalPrice,
            subCategoryId,
            status,
            options: cleanQuoteOptions(options),
            expiresAt: status === "AUTO_APPROVED" ? quoteValidUntil() : null,
            adminNotes: quote.isProvisional
                ? "Poids inconnu : total provisoire, validation admin requise avant confirmation."
                : null,
        },
    });
}
async function getUserQuotes(userId) {
    return prisma_1.prisma.internationalQuote.findMany({
        where: { userId },
        include: {
            subCategory: {
                include: { category: true },
            },
        },
        orderBy: { createdAt: "desc" },
    });
}
