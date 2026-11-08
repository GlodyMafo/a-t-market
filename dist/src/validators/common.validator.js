"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subCategoryIdParams = exports.productIdParams = exports.orderIdParams = exports.idParams = exports.id = void 0;
const zod_1 = require("zod");
exports.id = zod_1.z
    .string({ error: "Identifiant invalide" })
    .min(1, "Identifiant invalide")
    .max(64, "Identifiant invalide");
exports.idParams = zod_1.z.object({ id: exports.id }).strict();
exports.orderIdParams = zod_1.z.object({ orderId: exports.id }).strict();
exports.productIdParams = zod_1.z.object({ productId: exports.id }).strict();
exports.subCategoryIdParams = zod_1.z.object({ subCategoryId: exports.id }).strict();
