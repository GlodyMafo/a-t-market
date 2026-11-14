"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const internationalQuote_controller_1 = require("../controllers/internationalQuote.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const rateLimiter_1 = require("../middlewares/rateLimiter");
const quotePreview_controller_1 = require("../controllers/quotePreview.controller");
const quotePrice_controller_1 = require("../controllers/quotePrice.controller");
const quotePriceRateLimiter_1 = require("../middlewares/quotePriceRateLimiter");
const router = (0, express_1.Router)();
// Aperçu de prix SANS compte : ne crée rien en base, renvoie un ticket signé.
router.post("/preview", rateLimiter_1.previewRateLimiter, quotePreview_controller_1.previewInternationalQuoteController);
router.post("/price", quotePriceRateLimiter_1.quotePriceRateLimiter, quotePrice_controller_1.priceQuoteController);
router.post("/", auth_middleware_1.authMiddleware, rateLimiter_1.extractionRateLimiter, internationalQuote_controller_1.createInternationalQuoteController);
router.get("/user", auth_middleware_1.authMiddleware, internationalQuote_controller_1.getUserQuotesController);
exports.default = router;
