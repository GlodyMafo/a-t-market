
import { Prisma } from "../../generated/prisma/client";
import { PREVIEW_TICKET_TTL_HOURS } from "../config/quotes";
import { cleanQuoteOptions, quoteValidUntil } from "./internationalQuote.service";
import { computeQuote, normalizeWeightKg } from "./pricing.service";
import { parseSupportedProductUrl } from "./productUrl";
import { QuotePreviewTicket } from "./quotePreviewTicket";
import { decideQuoteStatus, REVIEW_NOTICE } from "./quoteDecision";
import { resolveUnitPrice } from "./ticketPricing";

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
  options?: unknown,
  variantSku?: string | null
) {
  // Défense en profondeur : même si le ticket est signé, on revalide ce qu'il contient.
  try {
    parseSupportedProductUrl(ticket.productUrl);
  } catch {
    throw new QuoteTicketError(
      "Ce lien n'est plus pris en charge : refaites l'aperçu."
    );
  }

  if (ticket.subCategoryId) {
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
  }

  // Poids et source du poids vont ensemble : jamais l'un sans l'autre.
  if ((ticket.weightKg === null) !== (ticket.weightSource === null)) {
    throw new QuoteTicketError("Ticket d'aperçu invalide.");
  }

  // Résolution du prix selon la variante sélectionnée.
  let unitPrice: string;

  try {
    unitPrice = resolveUnitPrice(ticket, variantSku);
  } catch (error) {
    throw new QuoteTicketError(
      error instanceof Error
        ? error.message
        : "Ticket d'aperçu invalide."
    );
  }

  let breakdown;
  let weight: Prisma.Decimal | null = null;

  try {
    weight =
      ticket.weightKg === null
        ? null
        : normalizeWeightKg(ticket.weightKg);

    breakdown = computeQuote({
      productPrice: unitPrice,
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

  const settings = await tx.globalSettings.findFirst();

  const decision = decideQuoteStatus({
    isProvisional: breakdown.isProvisional,
    totalPrice: breakdown.totalPrice,
    autoApproveMaxUsd: settings?.autoApproveMaxUsd,
  });

  const status = decision.status;

  // La validité du prix part de l'émission du ticket (et non de la fusion) :
  // un prix ne devient pas plus frais parce que le client s'est connecté plus tard.
  const issuedAt = new Date(
    (ticket.exp - PREVIEW_TICKET_TTL_HOURS * 3600) * 1000
  );

  return tx.internationalQuote.create({
    data: {
      userId,
      productUrl: ticket.productUrl,
      productName: ticket.productName,
      productPrice: breakdown.productPrice,
      productWeight: weight,
      imageUrl: ticket.imageUrl ?? null,
      weightSource: ticket.weightSource,
      currency: "USD",
      sourceProductPrice: ticket.sourceProductPrice ?? null,
      sourceCurrency: ticket.sourceCurrency ?? null,
      exchangeRate: ticket.exchangeRate ?? null,
      minOrderQuantity: ticket.minOrderQuantity ?? null,
      commissionRate: ticket.commissionRate,
      chinaPricePerKg: ticket.chinaPricePerKg,
      fixedFee: ticket.fixedFee,
      shippingCost: breakdown.shippingCost,
      customsCost: breakdown.customsCost,
      commissionCost: breakdown.commissionCost,
      totalPrice: breakdown.totalPrice,
      subCategoryId: ticket.subCategoryId ?? null,
      status,
      options: cleanQuoteOptions(options),

      previewId: variantSku
        ? `${ticket.id}:${variantSku}`
        : ticket.id,

      expiresAt:
        status === "AUTO_APPROVED"
          ? quoteValidUntil(issuedAt)
          : null,

      adminNotes:
        [
          breakdown.isProvisional
            ? "Poids inconnu : total provisoire, validation admin requise avant confirmation."
            : null,
          variantSku
            ? `Variante choisie (SKU) : ${variantSku}`
            : null,
        ]
          .filter(Boolean)
          .join(" ") || null,
    },
  });
}
