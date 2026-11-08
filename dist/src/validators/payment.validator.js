"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPaymentSchema = void 0;
const zod_1 = require("zod");
exports.createPaymentSchema = zod_1.z.object({
    orderId: zod_1.z.string()
        .min(1, "OrderId obligatoire"),
    paymentType: zod_1.z.enum([
        "PRODUCT",
        "SHIPPING",
        "FULL"
    ]),
    phoneNumber: zod_1.z.string()
        .min(9, "Numéro invalide"),
    provider: zod_1.z.string()
        .min(1, "Provider obligatoire")
});
