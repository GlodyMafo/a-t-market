"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatUsd = exports.orderRef = exports.NOTIFICATION_EVENT = void 0;
exports.recordNotification = recordNotification;
exports.publishNotification = publishNotification;
exports.getNotification = getNotification;
exports.listNotifications = listNotifications;
exports.markNotificationRead = markNotificationRead;
exports.markAllNotificationsRead = markAllNotificationsRead;
const prisma_1 = require("../lib/prisma");
const emitter_1 = require("../realtime/emitter");
const appError_1 = require("../utils/appError");
exports.NOTIFICATION_EVENT = "notification";
const publicFields = {
    id: true,
    type: true,
    orderId: true,
    title: true,
    message: true,
    data: true,
    readAt: true,
    createdAt: true,
};
/** Écrit la notification au journal. N'envoie rien : voir `publishNotification`, à appeler après le commit. */
async function recordNotification(db, n) {
    const record = await db.notification.create({
        data: {
            userId: n.userId,
            type: n.type,
            orderId: n.orderId,
            title: n.title,
            message: n.message,
            data: n.data,
            emailStatus: n.emailWanted ? "PENDING" : "NONE",
        },
        select: { ...publicFields, userId: true },
    });
    return record;
}
/** Livraison temps réel, à appeler APRÈS le commit de la transaction. Ne lève jamais d'erreur. */
function publishNotification(record) {
    const { userId, ...payload } = record;
    (0, emitter_1.emitToUser)(userId, exports.NOTIFICATION_EVENT, payload);
}
/** Référence courte d'une commande, lisible par le client. */
const orderRef = (orderId) => `#${orderId.slice(-6).toUpperCase()}`;
exports.orderRef = orderRef;
const formatUsd = (value) => `${Number(value).toFixed(2)} $`;
exports.formatUsd = formatUsd;
/** Récupère une notification appartenant exclusivement à l'utilisateur connecté. */
async function getNotification(userId, id) {
    const notification = await prisma_1.prisma.notification.findFirst({
        where: { id, userId },
        select: publicFields,
    });
    if (!notification) {
        throw new appError_1.NotFoundError("Notification introuvable");
    }
    return notification;
}
// ---------- Journal côté client ----------
async function listNotifications(userId, opts) {
    const where = { userId, ...(opts.unreadOnly ? { readAt: null } : {}) };
    const [items, total, unread] = await Promise.all([
        prisma_1.prisma.notification.findMany({
            where,
            select: publicFields,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            ...opts.paging,
        }),
        prisma_1.prisma.notification.count({ where }),
        prisma_1.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, total, unread };
}
/** Marque une notification comme lue (la sienne uniquement). Sans effet si elle l'est déjà. */
async function markNotificationRead(userId, id) {
    const mine = await prisma_1.prisma.notification.findFirst({
        where: { id, userId },
        select: { id: true },
    });
    if (!mine)
        throw new appError_1.NotFoundError("Notification introuvable");
    // `readAt: null` : la première lecture est conservée si deux appels arrivent ensemble.
    await prisma_1.prisma.notification.updateMany({
        where: { id, userId, readAt: null },
        data: { readAt: new Date() },
    });
    return prisma_1.prisma.notification.findUniqueOrThrow({ where: { id }, select: publicFields });
}
async function markAllNotificationsRead(userId) {
    const result = await prisma_1.prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
    });
    return { updated: result.count };
}
