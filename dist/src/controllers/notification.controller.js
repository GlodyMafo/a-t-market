"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listNotificationsController = listNotificationsController;
exports.markNotificationReadController = markNotificationReadController;
exports.markAllNotificationsReadController = markAllNotificationsReadController;
exports.getNotificationController = getNotificationController;
const appError_1 = require("../utils/appError");
const pagination_1 = require("../utils/pagination");
const notification_service_1 = require("../services/notification.service");
async function listNotificationsController(req, res) {
    try {
        const { page, limit, paging } = (0, pagination_1.parsePagination)(req.query);
        const unreadOnly = req.query.unread === "true";
        const { items, total, unread } = await (0, notification_service_1.listNotifications)(req.user.userId, {
            unreadOnly,
            paging,
        });
        return res.json({
            success: true,
            data: items,
            meta: { ...(0, pagination_1.pageMeta)(total, page, limit), unread },
        });
    }
    catch (error) {
        return (0, appError_1.sendError)(res, error);
    }
}
async function markNotificationReadController(req, res) {
    try {
        const { id } = req.params;
        return res.json({
            success: true,
            data: await (0, notification_service_1.markNotificationRead)(req.user.userId, id),
        });
    }
    catch (error) {
        return (0, appError_1.sendError)(res, error);
    }
}
async function markAllNotificationsReadController(req, res) {
    try {
        return res.json({
            success: true,
            data: await (0, notification_service_1.markAllNotificationsRead)(req.user.userId),
        });
    }
    catch (error) {
        return (0, appError_1.sendError)(res, error);
    }
}
async function getNotificationController(req, res) {
    try {
        const { id } = req.params;
        return res.json({
            success: true,
            data: await (0, notification_service_1.getNotification)(req.user.userId, id),
        });
    }
    catch (error) {
        return (0, appError_1.sendError)(res, error);
    }
}
