import { z } from "zod";
import { TRACKING_STATUSES } from "../services/orderFlow";

const deuxDecimales = (v: number) => Math.round(v * 100) / 100 === v;

const id = z
  .string({ error: "Identifiant invalide" })
  .min(1, "Identifiant invalide")
  .max(64, "Identifiant invalide");

export const idParams = z.object({ id }).strict();
export const orderIdParams = z.object({ orderId: id }).strict();
export const productIdParams = z.object({ productId: id }).strict();

const price = z
  .number({ error: "Le prix doit être un nombre" })
  .positive("Le prix doit être supérieur à 0")
  .max(99_999_999.99, "Le prix est trop élevé")
  .refine(deuxDecimales, "Le prix doit avoir 2 décimales au maximum");

const margin = z
  .number({ error: "La marge doit être un nombre" })
  .min(0, "La marge ne peut pas être négative")
  .max(99_999_999.99, "La marge est trop élevée")
  .refine(deuxDecimales, "La marge doit avoir 2 décimales au maximum");

const name = z
  .string({ error: "Le nom est obligatoire" })
  .trim()
  .min(1, "Le nom est obligatoire")
  .max(200, "Le nom est trop long (200 caractères maximum)");

const description = z
  .string({ error: "La description doit être un texte" })
  .trim()
  .max(2000, "La description est trop longue (2000 caractères maximum)");

export const createProductSchema = z
  .object({
    name,
    description: description.optional(),
    price,
    margin: margin.default(0),
    images: z
      .array(z.string().trim().min(1, "Image invalide").max(500, "Image invalide"), {
        error: "images doit être une liste",
      })
      .max(3, "Maximum 3 images par produit")
      .default([]),
    subCategoryId: id,
  })
  .strict();

// Liste blanche : rien d'autre ne peut être modifié par cette route.
export const updateProductSchema = z
  .object({
    name: name.optional(),
    description: description.optional(),
    price: price.optional(),
    margin: margin.optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, "Aucun champ à modifier");

export const trackingBodySchema = z
  .object({
    status: z.enum(TRACKING_STATUSES, {
      error: `status doit être l'un de : ${TRACKING_STATUSES.join(", ")}`,
    }),
    message: z
      .string()
      .trim()
      .min(1, "Le message ne peut pas être vide")
      .max(500, "Le message est trop long (500 caractères maximum)")
      .optional(),
  })
  .strict();

const stockQuantity = (min: number) =>
  z
    .number({ error: "La quantité doit être un nombre" })
    .int("La quantité doit être un entier")
    .min(min, min === 0 ? "La quantité ne peut pas être négative" : "La quantité doit être supérieure à 0")
    .max(1_000_000, "La quantité est trop grande");

export const updateInventorySchema = z.object({ quantity: stockQuantity(0) }).strict();

export const restockInventorySchema = z
  .object({
    quantity: stockQuantity(1),
    reason: z.string().trim().min(1).max(200, "La raison est trop longue (200 caractères maximum)").optional(),
  })
  .strict();