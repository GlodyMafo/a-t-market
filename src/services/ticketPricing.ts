import { Prisma } from "../../generated/prisma/client";
import { computeQuote, normalizeWeightKg } from "./pricing.service";
import type { QuotePreviewTicket } from "./quotePreviewTicket";

/** Prix unitaire (USD) de la variante choisie. Erreurs sans détail technique : messages destinés au client. */
export function resolveUnitPrice(ticket: QuotePreviewTicket, variantSku?: string | null): string {
  if (!ticket.variantRequired) return ticket.productPrice;
  if (!variantSku) throw new Error("Choisissez les options du produit avant de continuer.");
  const entry = ticket.variantTable?.find(([sku]) => sku === variantSku);
  const price = entry ? ticket.variantPrices?.[entry[1]] : undefined;
  if (!price) throw new Error("Cette option n'est plus proposée : refaites l'aperçu du produit.");
  return price;
}

/**
 * Prix exact pour une variante et une quantité. Même formule que le panier :
 * prix et poids multipliés par la quantité, commission sur le total, frais fixes une seule fois.
 */
export function priceTicketSelection(
  ticket: QuotePreviewTicket,
  selection: { variantSku?: string | null; quantity: number }
) {
  const { quantity } = selection;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    throw new Error("La quantité doit être un entier compris entre 1 et 999.");
  }

    if (ticket.stockLimit && quantity > ticket.stockLimit) {
    throw new Error(`Seulement ${ticket.stockLimit} disponible(s) chez le vendeur.`);
  }
  
  const unit = new Prisma.Decimal(resolveUnitPrice(ticket, selection.variantSku));
  const weight = ticket.weightKg === null ? null : normalizeWeightKg(ticket.weightKg);
  try {
    return computeQuote({
      productPrice: unit.mul(quantity),
      weightKg: weight === null ? null : weight.mul(quantity),
      settings: {
        commissionRate: ticket.commissionRate,
        chinaPricePerKg: ticket.chinaPricePerKg,
        fixedFee: ticket.fixedFee,
      },
    });
  } catch {
    throw new Error("Cette quantité dépasse la limite autorisée pour ce produit.");
  }
}