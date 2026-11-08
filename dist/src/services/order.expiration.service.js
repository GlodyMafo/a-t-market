"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expireUnpaidOrders = expireUnpaidOrders;
const prisma_1 = require("../lib/prisma");
const inventory_service_1 = require("./inventory.service");
const notification_service_1 = require("./notification.service");
const admin_email_service_1 = require("./admin.email.service");
// Paiements qui empêchent d'annuler une commande (argent reçu ou en cours)
const ACTIVE_PAYMENT_STATUSES = ["PENDING", "PARTIAL", "PAID"];
/**
 * Annule les commandes non payées dont la réservation a expiré et remet leur stock.
 * Une commande avec un paiement encore en cours (PENDING) n'est JAMAIS annulée :
 * on attend que PawaPay ait tranché, pour ne pas perdre la commande d'un client qui paie.
 */
async function expireUnpaidOrders() {
    const limit = new Date(Date.now() - inventory_service_1.ORDER_RESERVATION_MINUTES * 60 * 1000);
    const candidates = await prisma_1.prisma.order.findMany({
        where: {
            status: "PENDING_PAYMENT",
            createdAt: { lt: limit },
            payments: { none: { status: { in: [...ACTIVE_PAYMENT_STATUSES] } } },
        },
        select: { id: true },
    });
    let expired = 0;
    for (const candidate of candidates) {
        try {
            const notification = await prisma_1.prisma.$transaction(async (tx) => {
                // Même verrou que createPayment : un paiement en cours de création et
                // une expiration ne peuvent pas se croiser.
                await tx.$queryRaw `
          SELECT id FROM "Order" WHERE id = ${candidate.id} FOR UPDATE
        `;
                // On revérifie sous verrou : la situation a pu changer depuis la liste.
                const stillExpirable = await tx.order.findFirst({
                    where: {
                        id: candidate.id,
                        status: "PENDING_PAYMENT",
                        payments: {
                            none: { status: { in: [...ACTIVE_PAYMENT_STATUSES] } },
                        },
                    },
                    select: { id: true },
                });
                if (!stillExpirable)
                    return null;
                await tx.order.update({
                    where: { id: candidate.id },
                    data: { status: "CANCELLED" },
                });
                await (0, inventory_service_1.releaseStockForOrder)(tx, candidate.id);
                // La notification est créée dans la même transaction que l'annulation.
                // Si la transaction échoue, elle est également annulée.
                return (0, notification_service_1.recordNotification)(tx, {
                    userId: (await tx.order.findUniqueOrThrow({
                        where: { id: candidate.id },
                        select: { userId: true },
                    })).userId,
                    type: "ORDER_CANCELLED",
                    orderId: candidate.id,
                    title: "Commande expirée",
                    message: `Votre commande ${(0, notification_service_1.orderRef)(candidate.id)} a été annulée automatiquement faute de paiement dans le délai prévu.`,
                    emailWanted: true,
                    data: {
                        reason: "RESERVATION_EXPIRED",
                    },
                });
            });
            if (notification) {
                expired++;
                // Publication après validation de la transaction.
                (0, notification_service_1.publishNotification)(notification);
                void (0, admin_email_service_1.notifyAdmin)(notification);
            }
        }
        catch (error) {
            console.error("ORDER EXPIRATION ERROR:", candidate.id, error.message);
        }
    }
    return expired;
}
