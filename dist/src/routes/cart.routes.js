"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cart_controller_1 = require("../controllers/cart.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const validate_1 = require("../middlewares/validate");
const common_validator_1 = require("../validators/common.validator");
const cart_validator_1 = require("../validators/cart.validator");
const router = (0, express_1.Router)();
router.post("/", auth_middleware_1.authMiddleware, (0, validate_1.validate)({ body: cart_validator_1.addToCartSchema }), cart_controller_1.addToCartController);
router.get("/me", auth_middleware_1.authMiddleware, cart_controller_1.getCartController);
router.patch("/item/:id", auth_middleware_1.authMiddleware, (0, validate_1.validate)({ params: common_validator_1.idParams, body: cart_validator_1.updateCartItemSchema }), cart_controller_1.updateCartItemController);
router.delete("/item/:id", auth_middleware_1.authMiddleware, (0, validate_1.validate)({ params: common_validator_1.idParams }), cart_controller_1.removeCartItemController);
// Panier hybride : devis internationaux et fusion du panier invité
router.post("/quotes", auth_middleware_1.authMiddleware, (0, validate_1.validate)({ body: cart_validator_1.addQuoteToCartSchema }), cart_controller_1.addQuoteToCartController);
router.post("/merge", auth_middleware_1.authMiddleware, cart_controller_1.mergeCartController);
exports.default = router;
