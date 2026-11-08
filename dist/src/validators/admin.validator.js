"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.restockInventorySchema = exports.updateInventorySchema = exports.trackingBodySchema = exports.updateProductSchema = exports.createProductSchema = exports.productIdParams = exports.orderIdParams = exports.idParams = void 0;
const zod_1 = require("zod");
const orderFlow_1 = require("../services/orderFlow");
const common_validator_1 = require("./common.validator");
const deuxDecimales = (v) => Math.round(v * 100) / 100 === v;
exports.idParams = zod_1.z.object({ id: common_validator_1.id }).strict();
exports.orderIdParams = zod_1.z.object({ orderId: common_validator_1.id }).strict();
exports.productIdParams = zod_1.z.object({ productId: common_validator_1.id }).strict();
const price = zod_1.z
    .number({ error: "Le prix doit être un nombre" })
    .positive("Le prix doit être supérieur à 0")
    .max(99_999_999.99, "Le prix est trop élevé")
    .refine(deuxDecimales, "Le prix doit avoir 2 décimales au maximum");
const margin = zod_1.z
    .number({ error: "La marge doit être un nombre" })
    .min(0, "La marge ne peut pas être négative")
    .max(99_999_999.99, "La marge est trop élevée")
    .refine(deuxDecimales, "La marge doit avoir 2 décimales au maximum");
const name = zod_1.z
    .string({ error: "Le nom est obligatoire" })
    .trim()
    .min(1, "Le nom est obligatoire")
    .max(200, "Le nom est trop long (200 caractères maximum)");
const description = zod_1.z
    .string({ error: "La description doit être un texte" })
    .trim()
    .max(2000, "La description est trop longue (2000 caractères maximum)");
exports.createProductSchema = zod_1.z
    .object({
    name,
    description: description.optional(),
    price,
    margin: margin.default(0),
    images: zod_1.z
        .array(zod_1.z.string().trim().min(1, "Image invalide").max(500, "Image invalide"), {
        error: "images doit être une liste",
    })
        .max(3, "Maximum 3 images par produit")
        .default([]),
    subCategoryId: common_validator_1.id,
})
    .strict();
// Liste blanche : rien d'autre ne peut être modifié par cette route.
exports.updateProductSchema = zod_1.z
    .object({
    name: name.optional(),
    description: description.optional(),
    price: price.optional(),
    margin: margin.optional(),
})
    .strict()
    .refine((o) => Object.keys(o).length > 0, "Aucun champ à modifier");
exports.trackingBodySchema = zod_1.z
    .object({
    status: zod_1.z.enum(orderFlow_1.TRACKING_STATUSES, {
        error: `status doit être l'un de : ${orderFlow_1.TRACKING_STATUSES.join(", ")}`,
    }),
    message: zod_1.z
        .string()
        .trim()
        .min(1, "Le message ne peut pas être vide")
        .max(500, "Le message est trop long (500 caractères maximum)")
        .optional(),
})
    .strict();
const stockQuantity = (min) => zod_1.z
    .number({ error: "La quantité doit être un nombre" })
    .int("La quantité doit être un entier")
    .min(min, min === 0 ? "La quantité ne peut pas être négative" : "La quantité doit être supérieure à 0")
    .max(1_000_000, "La quantité est trop grande");
exports.updateInventorySchema = zod_1.z.object({ quantity: stockQuantity(0) }).strict();
exports.restockInventorySchema = zod_1.z
    .object({
    quantity: stockQuantity(1),
    reason: zod_1.z.string().trim().min(1).max(200, "La raison est trop longue (200 caractères maximum)").optional(),
})
    .strict();
