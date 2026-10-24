import { Prisma } from "../../generated/prisma/client";
import { PREVIEW_TICKET_TTL_HOURS } from "../config/quotes";
import { cleanQuoteOptions, quoteValidUntil } from "./internationalQuote.service";
import { computeQuote, normalizeWeightKg } from "./pricing.service";
import { parseSupportedProductUrl } from "./productUrl";
import { QuotePreviewTicket } from "./quotePreviewTicket";

/** Erreur « métier » : le ticket est correct mais ne peut pas (ou plus) devenir un devis. */
export class QuoteTicketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteTicketError";
  }
}

/**
 * Crée le devis enregistré à partir d'un ticket d'aperçu DÉJÀ VÉRIFIÉ (signature, date).
 * Aucun appel à Apify : tout ce qu'il faut est dans le ticket signé.
 * Le prix annoncé à l'invité est conservé : les taux du ticket sont ceux utilisés.
 */
export async function createQuoteFromTicket(
  tx: Prisma.TransactionClient,
  userId: string,
  ticket: QuotePreviewTicket,
  options?: unknown
) {
  // Défense en profondeur : même si le ticket est signé, on revalide ce qu'il contient.
  try {
    parseSupportedProductUrl(ticket.productUrl);
  } catch {
    throw new QuoteTicketError("Ce lien n'est plus pris en charge : refaites l'aperçu.");
  }

  const subCategory = await tx.subCategory.findFirst({
    where: {
      id: ticket.subCategoryId,
      isActive: true,
      category: { isActive: true },
    },
    select: { id: true },
  });

  if (!subCategory) {
    throw new QuoteTicketError(
      "La sous-catégorie n'est plus disponible : refaites l'aperçu du produit."
    );
  }

  // Poids et source du poids vont ensemble : jamais l'un sans l'autre.
  if ((ticket.weightKg === null) !== (ticket.weightSource === null)) {
    throw new QuoteTicketError("Ticket d'aperçu invalide.");
  }

  let breakdown;
  let weight: Prisma.Decimal | null = null;

  try {
    weight = ticket.weightKg === null ? null : normalizeWeightKg(ticket.weightKg);
    breakdown = computeQuote({
      productPrice: ticket.productPrice,
      weightKg: weight,
      settings: {
        commissionRate: ticket.commissionRate,
        chinaPricePerKg: ticket.chinaPricePerKg,
        fixedFee: ticket.fixedFee,
      },
    });
  } catch {
    throw new QuoteTicketError("Ticket d'aperçu invalide.");
  }

  const status = breakdown.isProvisional ? "PENDING_REVIEW" : "AUTO_APPROVED";

  // La validité du prix part de l'émission du ticket (et non de la fusion) :
  // un prix ne devient pas plus frais parce que le client s'est connecté plus tard.
  const issuedAt = new Date((ticket.exp - PREVIEW_TICKET_TTL_HOURS * 3600) * 1000);

  return tx.internationalQuote.create({
    data: {
      userId,
      productUrl: ticket.productUrl,
      productName: ticket.productName,
      productPrice: breakdown.productPrice,
      productWeight: weight,
      weightSource: ticket.weightSource,
      currency: "USD",
      commissionRate: ticket.commissionRate,
      chinaPricePerKg: ticket.chinaPricePerKg,
      fixedFee: ticket.fixedFee,
      shippingCost: breakdown.shippingCost,
      customsCost: breakdown.customsCost,
      commissionCost: breakdown.commissionCost,
      totalPrice: breakdown.totalPrice,
      subCategoryId: ticket.subCategoryId,
      status,
      options: cleanQuoteOptions(options),
      previewId: ticket.id,
      expiresAt: status === "AUTO_APPROVED" ? quoteValidUntil(issuedAt) : null,
      adminNotes: breakdown.isProvisional
        ? "Poids inconnu : total provisoire, validation admin requise avant confirmation."
        : null,
    },
  });
}