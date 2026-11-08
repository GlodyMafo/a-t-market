"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setActiveSchema = exports.updateSubCategorySchema = exports.createSubCategorySchema = exports.updateCategorySchema = exports.createCategorySchema = exports.catalogQuerySchema = exports.CATALOG_SORTS = void 0;
const zod_1 = require("zod");
const common_validator_1 = require("./common.validator");
exports.CATALOG_SORTS = ["relevance", "newest", "price_asc", "price_desc", "name_asc"];
// Un champ vide (?minPrice=) est traité comme absent, pas comme 0.
const videVersAbsent = (v) => (v === "" ? undefined : v);
const prix = (label) => zod_1.z.preprocess(videVersAbsent, zod_1.z.coerce
    .number({ error: `${label} invalide` })
    .min(0, `${label} invalide`)
    .max(99_999_999.99, `${label} invalide`)
    .optional());
exports.catalogQuerySchema = zod_1.z
    .object({
    q: zod_1.z.preprocess(videVersAbsent, zod_1.z.string({ error: "Recherche invalide" }).trim().max(100, "La recherche est trop longue (100 caractères maximum)").optional()),
    categoryId: zod_1.z.preprocess(videVersAbsent, common_validator_1.id.optional()),
    subCategoryId: zod_1.z.preprocess(videVersAbsent, common_validator_1.id.optional()),
    minPrice: prix("Prix minimum"),
    maxPrice: prix("Prix maximum"),
    sort: zod_1.z.preprocess(videVersAbsent, zod_1.z.enum(exports.CATALOG_SORTS, { error: `Tri invalide (valeurs possibles : ${exports.CATALOG_SORTS.join(", ")})` }).optional()),
})
    .refine((v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice, { message: "Le prix minimum dépasse le prix maximum", path: ["minPrice"] });
// Au moins une lettre ou un chiffre : un nom fait uniquement de symboles donnerait un « slug » vide.
const nom = (label) => zod_1.z
    .string({ error: `${label} est obligatoire` })
    .trim()
    .min(1, `${label} est obligatoire`)
    .max(100, `${label} est trop long (100 caractères maximum)`)
    .refine((v) => /[\p{L}\p{N}]/u.test(v), `${label} doit contenir au moins une lettre ou un chiffre`);
const description = zod_1.z
    .string({ error: "La description doit être un texte" })
    .trim()
    .max(500, "La description est trop longue (500 caractères maximum)");
exports.createCategorySchema = zod_1.z.object({ name: nom("Le nom"), description: description.optional() }).strict();
exports.updateCategorySchema = zod_1.z
    .object({ name: nom("Le nom").optional(), description: description.nullable().optional() })
    .strict()
    .refine((o) => Object.keys(o).length > 0, "Aucun champ à modifier");
exports.createSubCategorySchema = zod_1.z
    .object({ name: nom("Le nom"), categoryId: common_validator_1.id, description: description.optional() })
    .strict();
exports.updateSubCategorySchema = zod_1.z
    .object({ name: nom("Le nom").optional(), description: description.nullable().optional(), categoryId: common_validator_1.id.optional() })
    .strict()
    .refine((o) => Object.keys(o).length > 0, "Aucun champ à modifier");
exports.setActiveSchema = zod_1.z
    .object({ isActive: zod_1.z.boolean({ error: "isActive doit être true ou false" }) })
    .strict();
