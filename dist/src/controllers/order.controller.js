"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrderController = createOrderController;
exports.getOrdersByUserController = getOrdersByUserController;
exports.getOrderByIdController = getOrderByIdController;
const appError_1 = require("../utils/appError");
const order_service_1 = require("../services/order.service");
const pagination_1 = require("../utils/pagination");
// Create order
async function createOrderController(req, res) {
    try {
        const order = await (0, order_service_1.createOrderFromCart)(req.user.userId);
        return res.status(201).json({
            success: true,
            data: order
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
// Get user orders
async function getOrdersByUserController(req, res) {
    try {
        const userId = req.user.userId;
        const { page, limit, paging } = (0, pagination_1.parsePagination)(req.query);
        const [data, total] = await Promise.all([
            (0, order_service_1.getOrdersByUser)(userId, paging),
            (0, order_service_1.countOrdersByUser)(userId),
        ]);
        return res.json({ success: true, data, meta: (0, pagination_1.pageMeta)(total, page, limit) });
    }
    catch (error) {
        return res.status(400).json({ success: false, message: (0, appError_1.safeMessage)(error) });
    }
}
async function getOrderByIdController(req, res) {
    try {
        const order = await (0, order_service_1.getOrderById)(req.params.id, req.user.userId);
        return res.json({
            success: true,
            data: order
        });
    }
    catch (error) {
        return res.status(404).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
