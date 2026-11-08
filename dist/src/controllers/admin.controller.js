"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllOrdersController = getAllOrdersController;
exports.getOrderDetailsController = getOrderDetailsController;
exports.addTrackingEventController = addTrackingEventController;
exports.getAdminStatsController = getAdminStatsController;
exports.getAllProductsAdminController = getAllProductsAdminController;
exports.toggleProductStatusController = toggleProductStatusController;
exports.updateProductController = updateProductController;
exports.createProductAdminController = createProductAdminController;
exports.getInventoryController = getInventoryController;
exports.updateInventoryController = updateInventoryController;
exports.restockInventoryController = restockInventoryController;
exports.getSettingsController = getSettingsController;
exports.updateSettingsController = updateSettingsController;
exports.deleteProductController = deleteProductController;
exports.getAdminDashboardController = getAdminDashboardController;
exports.getToPurchaseController = getToPurchaseController;
const admin_service_1 = require("../services/admin.service");
const orderTracking_service_1 = require("../services/orderTracking.service");
const appError_1 = require("../utils/appError");
const settings_service_1 = require("../services/settings.service");
const product_service_1 = require("../services/product.service");
const pagination_1 = require("../utils/pagination");
async function getAllOrdersController(req, res) {
    try {
        const { page, limit, paging } = (0, pagination_1.parsePagination)(req.query);
        const [data, total] = await Promise.all([(0, admin_service_1.getAllOrders)(paging), (0, admin_service_1.countAllOrders)()]);
        return res.json({ success: true, data, meta: (0, pagination_1.pageMeta)(total, page, limit) });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: (0, appError_1.safeMessage)(error) });
    }
}
async function getOrderDetailsController(req, res) {
    try {
        const { id } = req.params;
        return res.json({ success: true, data: await (0, admin_service_1.getOrderDetails)(id) });
    }
    catch (error) {
        return (0, appError_1.sendError)(res, error);
    }
}
async function addTrackingEventController(req, res) {
    try {
        const { orderId } = req.params;
        const { status, message } = req.body;
        const event = await (0, orderTracking_service_1.postTrackingEvent)({
            orderId,
            status,
            message,
            actorId: req.user.userId,
        });
        return res.status(201).json({ success: true, data: event });
    }
    catch (error) {
        return (0, appError_1.sendError)(res, error);
    }
}
async function getAdminStatsController(req, res) {
    try {
        const stats = await (0, admin_service_1.getAdminStats)();
        return res.json({
            success: true,
            data: stats
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
async function getAllProductsAdminController(req, res) {
    try {
        const { page, limit, paging } = (0, pagination_1.parsePagination)(req.query);
        const [data, total] = await Promise.all([(0, admin_service_1.getAllProductsAdmin)(paging), (0, admin_service_1.countProductsAdmin)()]);
        return res.json({ success: true, data, meta: (0, pagination_1.pageMeta)(total, page, limit) });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: (0, appError_1.safeMessage)(error) });
    }
}
async function toggleProductStatusController(req, res) {
    try {
        const { id } = req.params;
        const product = await (0, admin_service_1.toggleProductStatus)(id);
        return res.json({
            success: true,
            data: product
        });
    }
    catch (error) {
        return res.status(404).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
async function updateProductController(req, res) {
    try {
        const { id } = req.params;
        const product = await (0, admin_service_1.updateProduct)(id, req.body);
        return res.json({
            success: true,
            data: product
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
async function createProductAdminController(req, res) {
    try {
        const product = await (0, product_service_1.createProduct)(req.body);
        return res.status(201).json({
            success: true,
            data: product
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
async function getInventoryController(req, res) {
    try {
        const { page, limit, paging } = (0, pagination_1.parsePagination)(req.query);
        const [data, total] = await Promise.all([(0, admin_service_1.getInventory)(paging), (0, admin_service_1.countInventory)()]);
        return res.json({ success: true, data, meta: (0, pagination_1.pageMeta)(total, page, limit) });
    }
    catch (error) {
        return res.status(400).json({ success: false, message: (0, appError_1.safeMessage)(error) });
    }
}
async function updateInventoryController(req, res) {
    try {
        const { productId } = req.params;
        const { quantity } = req.body;
        const inventory = await (0, admin_service_1.updateInventory)(productId, quantity);
        return res.json({
            success: true,
            data: inventory
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
async function restockInventoryController(req, res) {
    try {
        const { productId } = req.params;
        const { quantity, reason } = req.body;
        const inventory = await (0, admin_service_1.restockInventory)(productId, quantity, reason);
        return res.json({
            success: true,
            data: inventory
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
async function getSettingsController(req, res) {
    try {
        const settings = await (0, settings_service_1.getSettings)();
        return res.json({
            success: true,
            data: settings
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
async function updateSettingsController(req, res) {
    try {
        const settings = await (0, settings_service_1.updateSettings)(req.body);
        return res.json({
            success: true,
            data: settings
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
async function deleteProductController(req, res) {
    try {
        const { id } = req.params;
        return res.json({ success: true, data: await (0, admin_service_1.deleteProduct)(id) });
    }
    catch (error) {
        return (0, appError_1.sendError)(res, error);
    }
}
async function getAdminDashboardController(req, res) {
    try {
        return res.json({ success: true, data: await (0, admin_service_1.getAdminDashboard)() });
    }
    catch (error) {
        return (0, appError_1.sendError)(res, error);
    }
}
async function getToPurchaseController(req, res) {
    try {
        return res.json({ success: true, data: await (0, admin_service_1.getInternationalOrdersToPurchase)() });
    }
    catch (error) {
        return (0, appError_1.sendError)(res, error);
    }
}
