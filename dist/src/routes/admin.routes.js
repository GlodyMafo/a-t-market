"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const admin_controller_1 = require("../controllers/admin.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const admin_middleware_1 = require("../middlewares/admin.middleware");
const validate_1 = require("../middlewares/validate");
const admin_validator_1 = require("../validators/admin.validator");
const common_validator_1 = require("../validators/common.validator");
const category_controller_1 = require("../controllers/category.controller");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authMiddleware);
router.use(admin_middleware_1.adminMiddleware);
// --- Tableau de bord ---
router.get("/dashboard", admin_controller_1.getAdminDashboardController);
router.get("/dashboard/to-purchase", admin_controller_1.getToPurchaseController);
router.get("/stats", admin_controller_1.getAdminStatsController);
// --- Commandes ---
router.get("/orders", admin_controller_1.getAllOrdersController);
router.get("/orders/:id", (0, validate_1.validate)({ params: common_validator_1.idParams }), admin_controller_1.getOrderDetailsController);
router.post("/orders/:orderId/tracking", (0, validate_1.validate)({ params: common_validator_1.orderIdParams, body: admin_validator_1.trackingBodySchema }), admin_controller_1.addTrackingEventController);
// --- Produits ---
router.get("/products", admin_controller_1.getAllProductsAdminController);
router.post("/products", (0, validate_1.validate)({ body: admin_validator_1.createProductSchema }), admin_controller_1.createProductAdminController);
router.patch("/products/:id/toggle", (0, validate_1.validate)({ params: common_validator_1.idParams }), admin_controller_1.toggleProductStatusController);
router.patch("/products/:id", (0, validate_1.validate)({ params: common_validator_1.idParams, body: admin_validator_1.updateProductSchema }), admin_controller_1.updateProductController);
router.delete("/products/:id", (0, validate_1.validate)({ params: common_validator_1.idParams }), admin_controller_1.deleteProductController);
// --- Stock ---
router.get("/inventory", admin_controller_1.getInventoryController);
router.patch("/inventory/:productId", (0, validate_1.validate)({ params: admin_validator_1.productIdParams, body: admin_validator_1.updateInventorySchema }), admin_controller_1.updateInventoryController);
router.post("/inventory/restock/:productId", (0, validate_1.validate)({ params: admin_validator_1.productIdParams, body: admin_validator_1.restockInventorySchema }), admin_controller_1.restockInventoryController);
// --- Catégories (toutes, actives ou non) ---
router.get("/categories", category_controller_1.getCategoriesAdminController);
// --- Réglages ---
router.get("/settings", admin_controller_1.getSettingsController);
router.patch("/settings", admin_controller_1.updateSettingsController);
exports.default = router;
