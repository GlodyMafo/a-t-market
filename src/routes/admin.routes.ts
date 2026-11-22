import express from "express"
import { Router } from "express";

import {
  getAllOrdersController, getOrderDetailsController, createProductAdminController,
  addTrackingEventController, getAdminStatsController, getAllProductsAdminController,
  toggleProductStatusController, updateProductController, deleteProductController,
  getInventoryController, updateInventoryController, restockInventoryController,
  getSettingsController, updateSettingsController,
  getAdminDashboardController, getToPurchaseController,
  getInventoryMovementsController,
} from "../controllers/admin.controller";

import { authMiddleware } from "../middlewares/auth.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";
import { validate } from "../middlewares/validate";
import {
 productIdParams,
  createProductSchema, updateProductSchema, trackingBodySchema,
  updateInventorySchema, restockInventorySchema,
} from "../validators/admin.validator";

import { idParams, orderIdParams } from "../validators/common.validator";

import { getCategoriesAdminController } from "../controllers/category.controller";

import { uploadImageController } from "../controllers/upload.controller";
import { getProductAdminController } from "../controllers/admin.controller";


const router = Router();

router.use(authMiddleware);
router.use(adminMiddleware);

// --- Tableau de bord ---
router.get("/dashboard", getAdminDashboardController);
router.get("/dashboard/to-purchase", getToPurchaseController);
router.get("/stats", getAdminStatsController);

// --- Commandes ---
router.get("/orders", getAllOrdersController);
router.get("/orders/:id", validate({ params: idParams }), getOrderDetailsController);
router.post(
  "/orders/:orderId/tracking",
  validate({ params: orderIdParams, body: trackingBodySchema }),
  addTrackingEventController
);

// --- Produits ---
router.get("/products", getAllProductsAdminController);
router.post("/products", validate({ body: createProductSchema }), createProductAdminController);
router.get("/products/:id", validate({ params: idParams }), getProductAdminController);
router.patch("/products/:id/toggle", validate({ params: idParams }), toggleProductStatusController);
router.patch(
  "/products/:id",
  validate({ params: idParams, body: updateProductSchema }),
  updateProductController
);
router.delete("/products/:id", validate({ params: idParams }), deleteProductController);

// --- Stock ---
router.get("/inventory", getInventoryController);
router.patch(
  "/inventory/:productId",
  validate({ params: productIdParams, body: updateInventorySchema }),
  updateInventoryController
);

router.get("/inventory/:productId/movements", getInventoryMovementsController);

router.post(
  "/inventory/restock/:productId",
  validate({ params: productIdParams, body: restockInventorySchema }),
  restockInventoryController
);

// --- Catégories (toutes, actives ou non) ---
router.get("/categories", getCategoriesAdminController);

// --- Réglages ---
router.get("/settings", getSettingsController);
router.patch("/settings", updateSettingsController);

router.post(
  "/uploads",
  express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: "5mb" }),
  uploadImageController
);

export default router;