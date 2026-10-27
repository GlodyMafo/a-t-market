import { z } from "zod";
import { id } from "./common.validator";

// Même plafond que la fusion du panier invité ; le stock reste la vraie limite.
const quantity = z
  .number({ error: "La quantité doit être un nombre" })
  .int("La quantité doit être un entier")
  .min(1, "La quantité doit être au moins 1")
  .max(999, "La quantité est trop grande (999 maximum)");

export const addToCartSchema = z.object({
  productId: id,
  quantity: quantity.default(1),
});

export const updateCartItemSchema = z.object({ quantity });

export const addQuoteToCartSchema = z.object({ quoteId: id });