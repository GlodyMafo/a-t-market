"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addQuoteToCartSchema = exports.updateCartItemSchema = exports.addToCartSchema = void 0;
const zod_1 = require("zod");
const common_validator_1 = require("./common.validator");
// Même plafond que la fusion du panier invité ; le stock reste la vraie limite.
const quantity = zod_1.z
    .number({ error: "La quantité doit être un nombre" })
    .int("La quantité doit être un entier")
    .min(1, "La quantité doit être au moins 1")
    .max(999, "La quantité est trop grande (999 maximum)");
exports.addToCartSchema = zod_1.z.object({
    productId: common_validator_1.id,
    quantity: quantity.default(1),
});
exports.updateCartItemSchema = zod_1.z.object({ quantity });
exports.addQuoteToCartSchema = zod_1.z.object({
    quoteId: common_validator_1.id,
    quantity: quantity.default(1),
});
