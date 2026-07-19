import { Router } from "express";

import {
  getTrackingController, addTrackingEventController
}
from "../controllers/tracking.controller";

import {
  authMiddleware
}
from "../middlewares/auth.middleware";

const router = Router();

router.get(
  "/order/:orderId",
  authMiddleware,
  getTrackingController
);

router.post(
  "/order/:orderId",
  addTrackingEventController
);

export default router;