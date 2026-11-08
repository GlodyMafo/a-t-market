"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteIssue = quoteIssue;
exports.quoteIssueMessage = quoteIssueMessage;
exports.activeOrderQuoteIds = activeOrderQuoteIds;
const internationalQuote_service_1 = require("./internationalQuote.service");
/**
 * Pourquoi un devis ne peut (pas encore) être payé. null = il est payable.
 * Règle D : un devis provisoire (PENDING_REVIEW) n'est JAMAIS payable.
 */
function quoteIssue(quote, alreadyOrdered, now = new Date()) {
    if (quote.status === "REJECTED")
        return "REJECTED";
    if (alreadyOrdered)
        return "ALREADY_ORDERED";
    if (!(0, internationalQuote_service_1.isQuotePayable)(quote.status))
        return "PENDING_REVIEW";
    if ((0, internationalQuote_service_1.isQuoteExpired)(quote, now))
        return "EXPIRED";
    return null;
}
function quoteIssueMessage(issue, name) {
    const productName = name?.trim() || "produit international";
    switch (issue) {
        case "PENDING_REVIEW":
            return `Le devis « ${productName} » est en attente de validation par notre équipe : il ne peut pas encore être payé.`;
        case "REJECTED":
            return `Le devis « ${productName} » a été rejeté.`;
        case "EXPIRED":
            return `Le devis « ${productName} » a expiré : refaites un devis pour obtenir un prix à jour.`;
        case "ALREADY_ORDERED":
            return `Le devis « ${productName} » est déjà dans une commande.`;
    }
}
/** Devis (parmi ceux donnés) qui figurent déjà dans une commande NON annulée. */
async function activeOrderQuoteIds(client, quoteIds) {
    if (quoteIds.length === 0)
        return new Set();
    const rows = await client.orderItem.findMany({
        where: {
            quoteId: { in: quoteIds },
            order: { status: { not: "CANCELLED" } },
        },
        select: { quoteId: true },
    });
    return new Set(rows.map((r) => r.quoteId));
}
