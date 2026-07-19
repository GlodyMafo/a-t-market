import { Router } from "express";

import {
  getAllOrdersController, getOrderDetailsController, createProductAdminController, addTrackingEventController, getAdminStatsController, getAllProductsAdminController, toggleProductStatusController, updateProductController,
  getInventoryController,  updateInventoryController,  restockInventoryController} from "../controllers/admin.controller";

const router = Router();

router.get(
  "/orders",
  getAllOrdersController
);

router.get(
  "/orders/:id",
  getOrderDetailsController
);

router.post(
  "/orders/:orderId/tracking",
  addTrackingEventController
);

router.get(
  "/stats",
  getAdminStatsController
);

router.get(
  "/products",
  getAllProductsAdminController
);

router.patch(
  "/products/:id/toggle",
  toggleProductStatusController
);

router.patch(
  "/products/:id",
  updateProductController
);

router.post(
  "/products",
  createProductAdminController
);

router.get(
  "/inventory",
  getInventoryController
);

router.patch(
  "/inventory/:productId",
  updateInventoryController
);

router.post(
  "/inventory/restock/:productId",
  restockInventoryController
);

export default router;