import { Router } from "express";

import {
  getTrackingController
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


export default router;