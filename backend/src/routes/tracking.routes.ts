import { Router } from "express";

import {
  getTrackingController
}
  from "../controllers/tracking.controller";

import {
  authMiddleware
}
  from "../middlewares/auth.middleware";

import { orderIdParams } from "../validators/common.validator";
import { validate } from "../middlewares/validate";

const router = Router();

router.get(
  "/order/:orderId",
  authMiddleware,
  validate({ params: orderIdParams }),
  getTrackingController,

);


export default router;