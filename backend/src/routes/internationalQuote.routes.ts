import { Router } from "express";

import {
  createInternationalQuoteController,
  getUserQuotesController
} from "../controllers/internationalQuote.controller";

import { authMiddleware } from "../middlewares/auth.middleware";
import { extractionRateLimiter, previewRateLimiter } from "../middlewares/rateLimiter";
import { previewInternationalQuoteController } from "../controllers/quotePreview.controller";

const router = Router();

// Aperçu de prix SANS compte : ne crée rien en base, renvoie un ticket signé.
router.post(
  "/preview",
  previewRateLimiter,
  previewInternationalQuoteController
);

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