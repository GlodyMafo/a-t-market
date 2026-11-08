"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const externalProduct_controller_1 = require("../controllers/externalProduct.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const rateLimiter_1 = require("../middlewares/rateLimiter");
const router = (0, express_1.Router)();
router.post("/extract", auth_middleware_1.authMiddleware, rateLimiter_1.extractionRateLimiter, externalProduct_controller_1.extractExternalProductController);
exports.default = router;
