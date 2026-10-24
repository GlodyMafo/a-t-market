import { Prisma } from "../../generated/prisma/client";

export type QuoteRow = Prisma.InternationalQuoteGetPayload<object>;

/**
 * Photographie d'un devis (montants en texte) : copie figée utilisée
 *  - dans l'historique des décisions admin (QuoteRevision),
 *  - dans chaque article de commande issu d'un devis (OrderItem.quoteSnapshot).
 * Contient tout ce dont l'équipe a besoin pour acheter l'article (lien, nom, options, montants).
 */
export function quoteSnapshot(quote: QuoteRow): Prisma.InputJsonObject {
  const text = (value: Prisma.Decimal | null) =>
    value === null ? null : value.toString();

  return {
    quoteId: quote.id,
    productUrl: quote.productUrl,
    productName: quote.productName,
    status: quote.status,
    currency: quote.currency,
    productPrice: text(quote.productPrice),
    productWeight: text(quote.productWeight),
    weightSource: quote.weightSource,
    shippingCost: text(quote.shippingCost),
    customsCost: text(quote.customsCost),
    commissionCost: text(quote.commissionCost),
    totalPrice: text(quote.totalPrice),
    commissionRate: text(quote.commissionRate),
    chinaPricePerKg: text(quote.chinaPricePerKg),
    fixedFee: text(quote.fixedFee),
    adminNotes: quote.adminNotes,
    options: quote.options,
    expiresAt: quote.expiresAt ? quote.expiresAt.toISOString() : null,
  };
}