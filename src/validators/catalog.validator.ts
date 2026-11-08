import { z } from "zod";
import { id } from "./common.validator";

export const CATALOG_SORTS = ["relevance", "newest", "price_asc", "price_desc", "name_asc"] as const;

// Un champ vide (?minPrice=) est traité comme absent, pas comme 0.
const videVersAbsent = (v: unknown) => (v === "" ? undefined : v);

const prix = (label: string) =>
  z.preprocess(
    videVersAbsent,
    z.coerce
      .number({ error: `${label} invalide` })
      .min(0, `${label} invalide`)
      .max(99_999_999.99, `${label} invalide`)
      .optional()
  );

export const catalogQuerySchema = z
  .object({
    q: z.preprocess(
      videVersAbsent,
      z.string({ error: "Recherche invalide" }).trim().max(100, "La recherche est trop longue (100 caractères maximum)").optional()
    ),
    categoryId: z.preprocess(videVersAbsent, id.optional()),
    subCategoryId: z.preprocess(videVersAbsent, id.optional()),
    minPrice: prix("Prix minimum"),
    maxPrice: prix("Prix maximum"),
    sort: z.preprocess(
      videVersAbsent,
      z.enum(CATALOG_SORTS, { error: `Tri invalide (valeurs possibles : ${CATALOG_SORTS.join(", ")})` }).optional()
    ),
  })
  .refine(
    (v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice,
    { message: "Le prix minimum dépasse le prix maximum", path: ["minPrice"] }
  );

export type CatalogFilters = z.infer<typeof catalogQuerySchema>;

// Au moins une lettre ou un chiffre : un nom fait uniquement de symboles donnerait un « slug » vide.
const nom = (label: string) =>
  z
    .string({ error: `${label} est obligatoire` })
    .trim()
    .min(1, `${label} est obligatoire`)
    .max(100, `${label} est trop long (100 caractères maximum)`)
    .refine((v) => /[\p{L}\p{N}]/u.test(v), `${label} doit contenir au moins une lettre ou un chiffre`);

const description = z
  .string({ error: "La description doit être un texte" })
  .trim()
  .max(500, "La description est trop longue (500 caractères maximum)");

export const createCategorySchema = z.object({ name: nom("Le nom"), description: description.optional() }).strict();

export const updateCategorySchema = z
  .object({ name: nom("Le nom").optional(), description: description.nullable().optional() })
  .strict()
  .refine((o) => Object.keys(o).length > 0, "Aucun champ à modifier");

export const createSubCategorySchema = z
  .object({ name: nom("Le nom"), categoryId: id, description: description.optional() })
  .strict();

export const updateSubCategorySchema = z
  .object({ name: nom("Le nom").optional(), description: description.nullable().optional(), categoryId: id.optional() })
  .strict()
  .refine((o) => Object.keys(o).length > 0, "Aucun champ à modifier");

export const setActiveSchema = z
  .object({ isActive: z.boolean({ error: "isActive doit être true ou false" }) })
  .strict();