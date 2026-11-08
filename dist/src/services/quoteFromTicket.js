"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuoteTicketError = void 0;
exports.createQuoteFromTicket = createQuoteFromTicket;
const quotes_1 = require("../config/quotes");
const internationalQuote_service_1 = require("./internationalQuote.service");
const pricing_service_1 = require("./pricing.service");
const productUrl_1 = require("./productUrl");
/** Erreur « métier » : le ticket est correct mais ne peut pas (ou plus) devenir un devis. */
class QuoteTicketError extends Error {
    constructor(message) {
        super(message);
        this.name = "QuoteTicketError";
    }
}
exports.QuoteTicketError = QuoteTicketError;
/**
 * Crée le devis enregistré à partir d'un ticket d'aperçu DÉJÀ VÉRIFIÉ (signature, date).
 * Aucun appel à Apify : tout ce qu'il faut est dans le ticket signé.
 * Le prix annoncé à l'invité est conservé : les taux du ticket sont ceux utilisés.
 */
async function createQuoteFromTicket(tx, userId, ticket, options) {
    // Défense en profondeur : même si le ticket est signé, on revalide ce qu'il contient.
    try {
        (0, productUrl_1.parseSupportedProductUrl)(ticket.productUrl);
    }
    catch {
        throw new QuoteTicketError("Ce lien n'est plus pris en charge : refaites l'aperçu.");
    }
    const subCategory = await tx.subCategory.findFirst({
        where: {
            id: ticket.subCategoryId,
            isActive: true,
            category: { isActive: true },
        },
        select: { id: true },
    });
    if (!subCategory) {
        throw new QuoteTicketError("La sous-catégorie n'est plus disponible : refaites l'aperçu du produit.");
    }
    // Poids et source du poids vont ensemble : jamais l'un sans l'autre.
    if ((ticket.weightKg === null) !== (ticket.weightSource === null)) {
        throw new QuoteTicketError("Ticket d'aperçu invalide.");
    }
    let breakdown;
    let weight = null;
    try {
        weight = ticket.weightKg === null ? null : (0, pricing_service_1.normalizeWeightKg)(ticket.weightKg);
        breakdown = (0, pricing_service_1.computeQuote)({
            productPrice: ticket.productPrice,
            weightKg: weight,
            settings: {
                commissionRate: ticket.commissionRate,
                chinaPricePerKg: ticket.chinaPricePerKg,
                fixedFee: ticket.fixedFee,
            },
        });
    }
    catch {
        throw new QuoteTicketError("Ticket d'aperçu invalide.");
    }
    const status = breakdown.isProvisional ? "PENDING_REVIEW" : "AUTO_APPROVED";
    // La validité du prix part de l'émission du ticket (et non de la fusion) :
    // un prix ne devient pas plus frais parce que le client s'est connecté plus tard.
    const issuedAt = new Date((ticket.exp - quotes_1.PREVIEW_TICKET_TTL_HOURS * 3600) * 1000);
    return tx.internationalQuote.create({
        data: {
            userId,
            productUrl: ticket.productUrl,
            productName: ticket.productName,
            productPrice: breakdown.productPrice,
            productWeight: weight,
            weightSource: ticket.weightSource,
            currency: "USD",
            sourceProductPrice: ticket.sourceProductPrice ?? null,
            sourceCurrency: ticket.sourceCurrency ?? null,
            exchangeRate: ticket.exchangeRate ?? null,
            minOrderQuantity: ticket.minOrderQuantity ?? null,
            commissionRate: ticket.commissionRate,
            chinaPricePerKg: ticket.chinaPricePerKg,
            fixedFee: ticket.fixedFee,
            shippingCost: breakdown.shippingCost,
            customsCost: breakdown.customsCost,
            commissionCost: breakdown.commissionCost,
            totalPrice: breakdown.totalPrice,
            subCategoryId: ticket.subCategoryId,
            status,
            options: (0, internationalQuote_service_1.cleanQuoteOptions)(options),
            previewId: ticket.id,
            expiresAt: status === "AUTO_APPROVED" ? (0, internationalQuote_service_1.quoteValidUntil)(issuedAt) : null,
            adminNotes: breakdown.isProvisional
                ? "Poids inconnu : total provisoire, validation admin requise avant confirmation."
                : null,
        },
    });
}
