"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePawapayCallback = handlePawapayCallback;
const prisma_1 = require("../lib/prisma");
const payment_settlement_service_1 = require("./payment.settlement.service");
/**
 * Un callback PawaPay n'est qu'un SIGNAL ("va vérifier ce dépôt").
 * Son contenu (statut, montant…) n'est jamais utilisé pour décider : seule la
 * réponse de PawaPay à notre propre requête authentifiée fait foi.
 */
async function handlePawapayCallback(payload) {
    const log = await prisma_1.prisma.paymentWebhookLog.create({
        data: {
            depositId: payload.depositId,
            status: typeof payload.status === "string" ? payload.status : "UNKNOWN",
            payload: payload,
        },
    });
    try {
        const result = await (0, payment_settlement_service_1.settlePaymentByDepositId)(payload.depositId);
        await prisma_1.prisma.paymentWebhookLog.update({
            where: { id: log.id },
            data: {
                processed: true,
                paymentId: result.paymentId,
                error: result.outcome === "VERIFICATION_FAILED" ||
                    result.outcome === "UNKNOWN_PAYMENT"
                    ? (result.reason ?? result.outcome)
                    : null,
            },
        });
        return result;
    }
    catch (error) {
        await prisma_1.prisma.paymentWebhookLog.update({
            where: { id: log.id },
            data: { error: error.message },
        });
        throw error;
    }
}
