import { Router } from "express";

import {
  createInternationalQuoteController,
  getUserQuotesController
} from "../controllers/internationalQuote.controller";

import { authMiddleware } from "../middlewares/auth.middleware";
import { extractionRateLimiter } from "../middlewares/rateLimiter";

const router = Router();

router.post(
  "/",
  authMiddleware,
  extractionRateLimiter,
  createInternationalQuoteController
);

router.get(
  "/user",
  authMiddleware,
  getUserQuotesController
);

export default router;