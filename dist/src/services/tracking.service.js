"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrackingByOrder = getTrackingByOrder;
const prisma_1 = require("../lib/prisma");
const orderFlow_1 = require("./orderFlow");
const appError_1 = require("../utils/appError");
async function getTrackingByOrder(orderId, userId) {
    const order = await prisma_1.prisma.order.findFirst({
        where: { id: orderId, userId },
        select: {
            trackingEvents: {
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: { id: true, status: true, message: true, createdAt: true },
            },
        },
    });
    if (!order)
        throw new appError_1.NotFoundError("Commande introuvable");
    return order.trackingEvents.map((e) => ({ ...e, label: orderFlow_1.TRACKING_LABELS[e.status] }));
}
