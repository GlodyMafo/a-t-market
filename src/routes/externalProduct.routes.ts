import { Router } from "express";
import {
  extractExternalProductController,
} from "../controllers/externalProduct.controller";

import { authMiddleware } from "../middlewares/auth.middleware";
import { extractionRateLimiter } from "../middlewares/rateLimiter";

const router = Router();

router.post(
  "/extract",
  authMiddleware,
  extractionRateLimiter,
  extractExternalProductController
);

export default router;