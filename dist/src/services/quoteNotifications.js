"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approvedNotification = approvedNotification;
exports.rejectedNotification = rejectedNotification;
exports.notifyAdminsOfPendingQuotes = notifyAdminsOfPendingQuotes;
const prisma_1 = require("../lib/prisma");
const notification_service_1 = require("./notification.service");
const label = (name) => `« ${name?.trim() || "Produit importé"} »`;
/** Notification du client quand son devis est approuvé (à enregistrer dans la transaction d'approbation). */
function approvedNotification(quote) {
    const until = quote.expiresAt ? ` Prix valable jusqu'au ${quote.expiresAt.toLocaleDateString("fr-FR")}.` : "";
    return {
        userId: quote.userId,
        type: "QUOTE_APPROVED",
        title: "Votre devis est prêt",
        message: `${label(quote.productName)} : ${(0, notification_service_1.formatUsd)(quote.totalPrice)} livré en RDC. Vous pouvez le payer depuis votre panier.${until}`,
        data: { quoteId: quote.id },
    };
}
/** Notification du client quand son devis est rejeté, avec le motif de l'administrateur. */
function rejectedNotification(quote, note) {
    return {
        userId: quote.userId,
        type: "QUOTE_REJECTED",
        title: "Votre devis a été refusé",
        message: `${label(quote.productName)} n'a pas pu être accepté : ${note}`,
        data: { quoteId: quote.id },
    };
}
/**
 * Prévient les administrateurs des devis à valider, une seule fois par devis.
 * À appeler après tout ajout qui peut créer un devis « à valider ». Ne lève jamais d'erreur :
 * l'alerte ne doit jamais faire échouer le panier du client.
 */
async function notifyAdminsOfPendingQuotes() {
    try {
        const records = [];
        await prisma_1.prisma.$transaction(async (tx) => {
            const pending = await tx.internationalQuote.findMany({
                where: { status: "PENDING_REVIEW", adminNotifiedAt: null },
                select: { id: true, productName: true },
                orderBy: { createdAt: "asc" },
                take: 50,
            });
            if (pending.length === 0)
                return;
            const admins = await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
            for (const quote of pending) {
                // Réclamation atomique : deux appels simultanés ne préviennent pas deux fois pour le même devis.
                const claimed = await tx.internationalQuote.updateMany({
                    where: { id: quote.id, adminNotifiedAt: null, status: "PENDING_REVIEW" },
                    data: { adminNotifiedAt: new Date() },
                });
                if (claimed.count === 0)
                    continue;
                for (const admin of admins) {
                    records.push(await (0, notification_service_1.recordNotification)(tx, {
                        userId: admin.id,
                        type: "QUOTE_PENDING_REVIEW",
                        title: "Devis à valider",
                        message: `${label(quote.productName)} attend votre validation.`,
                        data: { quoteId: quote.id },
                    }));
                }
            }
        });
        records.forEach((record) => (0, notification_service_1.publishNotification)(record)); // après la validation de la transaction
    }
    catch (error) {
        console.error("NOTIFICATIONS DEVIS : impossible de prévenir les administrateurs :", error instanceof Error ? error.message : error);
    }
}
