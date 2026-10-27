import { z } from "zod";

export const id = z
  .string({ error: "Identifiant invalide" })
  .min(1, "Identifiant invalide")
  .max(64, "Identifiant invalide");

export const idParams = z.object({ id }).strict();
export const orderIdParams = z.object({ orderId: id }).strict();
export const productIdParams = z.object({ productId: id }).strict();
export const subCategoryIdParams = z.object({ subCategoryId: id }).strict();