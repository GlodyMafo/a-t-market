"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTrackingController = getTrackingController;
const tracking_service_1 = require("../services/tracking.service");
const appError_1 = require("../utils/appError");
async function getTrackingController(req, res) {
    try {
        const { orderId } = req.params;
        const tracking = await (0, tracking_service_1.getTrackingByOrder)(orderId, req.user.userId);
        return res.json({ success: true, data: tracking });
    }
    catch (error) {
        return (0, appError_1.sendError)(res, error);
    }
}
