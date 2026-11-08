"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postTrackingEvent = postTrackingEvent;
const prisma_1 = require("../lib/prisma");
const appError_1 = require("../utils/appError");
const notification_service_1 = require("./notification.service");
const orderFlow_1 = require("./orderFlow");
const email_templates_1 = require("./email/email.templates");
function refusCommande(status) {
    if (status === "DELIVERED") {
        return new appError_1.ConflictError("Cette commande est déjà livrée : son suivi est terminé.", "ORDER_ALREADY_DELIVERED");
    }
    if (status === "CANCELLED") {
        return new appError_1.ConflictError("Cette commande est annulée : son suivi ne peut pas être modifié.", "ORDER_CANCELLED");
    }
    return new appError_1.ConflictError("Cette commande n'est pas entièrement payée : son suivi ne peut pas être modifié.", "ORDER_NOT_PAID");
}
async function postTrackingEvent(input) {
    const { orderId, status, message, actorId } = input;
    const { event, note } = await prisma_1.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw `
      SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE
    `;
        if (locked.length === 0)
            throw new appError_1.NotFoundError("Commande introuvable");
        const order = await tx.order.findUniqueOrThrow({
            where: { id: orderId },
            select: { status: true, userId: true, items: { select: { quoteId: true } } },
        });
        if (order.status !== "PAID")
            throw refusCommande(order.status);
        const last = await tx.trackingEvent.findFirst({
            where: { orderId },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: { status: true },
        });
        const from = last?.status ?? null;
        try {
            (0, orderFlow_1.assertTransition)((0, orderFlow_1.getOrderKind)(order.items), from, status);
        }
        catch (error) {
            if (error instanceof orderFlow_1.InvalidTransitionError) {
                throw new appError_1.ConflictError(error.message, "INVALID_TRANSITION");
            }
            throw error;
        }
        const event = await tx.trackingEvent.create({
            data: {
                orderId,
                status,
                fromStatus: from,
                actorId,
                message,
                createdAt: new Date(),
            },
        });
        if (status === "DELIVERED") {
            await tx.order.update({ where: { id: orderId }, data: { status: "DELIVERED" } });
        }
        // Notification du client, dans la même transaction : pas de changement de statut sans trace.
        const label = orderFlow_1.TRACKING_LABELS[status];
        const emailWanted = (0, email_templates_1.isEmailTrackingStatus)(status);
        const note = await (0, notification_service_1.recordNotification)(tx, {
            userId: order.userId,
            type: "ORDER_STATUS_CHANGED",
            orderId,
            title: label,
            message: `Commande ${(0, notification_service_1.orderRef)(orderId)} : ${label}${message ? ` — ${message}` : ""}`,
            emailWanted,
            data: {
                status,
                label,
                ...(message ? { emailMessage: message } : {}),
            },
        });
        return { event, note };
    });
    // Livraison temps réel APRÈS le commit : si l'envoi échoue, le changement de statut reste enregistré.
    (0, notification_service_1.publishNotification)(note);
    return event;
}
