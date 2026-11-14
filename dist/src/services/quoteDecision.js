"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REVIEW_NOTICE = void 0;
exports.decideQuoteStatus = decideQuoteStatus;
const client_1 = require("../../generated/prisma/client");
function decideQuoteStatus(input) {
    if (input.isProvisional)
        return { status: "PENDING_REVIEW", reason: "UNKNOWN_WEIGHT" };
    if (input.autoApproveMaxUsd !== null && input.autoApproveMaxUsd !== undefined) {
        const cap = new client_1.Prisma.Decimal(input.autoApproveMaxUsd);
        if (cap.gt(0) && new client_1.Prisma.Decimal(input.totalPrice).gt(cap)) {
            return { status: "PENDING_REVIEW", reason: "ABOVE_LIMIT" };
        }
    }
    return { status: "AUTO_APPROVED", reason: null };
}
exports.REVIEW_NOTICE = {
    UNKNOWN_WEIGHT: "Le poids de ce produit est inconnu : le transport sera confirmé par notre équipe avant le paiement.",
    ABOVE_LIMIT: "Ce montant est vérifié par notre équipe avant le paiement.",
};
