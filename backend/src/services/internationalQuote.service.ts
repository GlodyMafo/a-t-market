import { prisma } from "../lib/prisma";
import { computeQuote } from "./pricing.service";
import { resolveQuoteWeight } from "./quoteWeight";
import { QUOTE_VALIDITY_DAYS } from "../config/quotes";

/** Un devis ne peut être payé que s'il est validé (automatiquement ou par un admin). */
export const PAYABLE_QUOTE_STATUSES = ["AUTO_APPROVED", "APPROVED"] as const;

export function isQuotePayable(status: string): boolean {
  return (PAYABLE_QUOTE_STATUSES as readonly string[]).includes(status);
}

/** Date de fin de validité d'un prix, à partir de la date donnée. */
export function quoteValidUntil(from: Date = new Date()): Date {
  return new Date(from.getTime() + QUOTE_VALIDITY_DAYS * 24 * 3600 * 1000);
}

/**
 * Un devis est périmé à sa date de fin de validité. Un ancien devis (créé avant l'existence
 * de cette date) est considéré valable QUOTE_VALIDITY_DAYS jours après sa création.
 */
export function isQuoteExpired(
  quote: { expiresAt: Date | null; createdAt: Date },
  now: Date = new Date()
): boolean {
  const limit = quote.expiresAt ?? quoteValidUntil(quote.createdAt);
  return now.getTime() >= limit.getTime();
}

/** Texte libre du client (taille, couleur...) : nettoyé et limité à 200 caractères. */
export function cleanQuoteOptions(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  return cleaned.length > 0 ? cleaned : null;
}

export async function createInternationalQuote(
  userId: string,
  productUrl: string,
  productName: string,
  productPrice: number,
  subCategoryId: string,
  extractedWeightKg?: number,
  options?: string | null
) {
  const settings = await prisma.globalSettings.findFirst();

  const subCategory = await prisma.subCategory.findFirst({
    where: {
      id: subCategoryId,
      isActive: true,
      category: {
        isActive: true,
      },
    },
  });

  if (!subCategory) {
    throw new Error(
      "La sous-catégorie sélectionnée est invalide ou inactive."
    );
  }

  if (!settings) {
    throw new Error("Configuration système introuvable");
  }

  if (!Number.isFinite(productPrice) || productPrice <= 0) {
    throw new Error("Le prix du produit doit être valide.");
  }

  if (
    extractedWeightKg !== undefined &&
    extractedWeightKg !== null &&
    (!Number.isFinite(extractedWeightKg) || extractedWeightKg <= 0)
  ) {
    throw new Error("Le poids du produit doit être valide.");
  }

  // Poids : extrait du site, sinon estimation validée du catalogue, sinon inconnu.
  // On garde aussi la SOURCE du poids, pour savoir plus tard s'il est réel ou estimé.
  const { weight: productWeight, source: weightSource } = await resolveQuoteWeight(
    extractedWeightKg,
    subCategoryId
  );

  const quote = computeQuote({
    productPrice,
    weightKg: productWeight,
    settings,
  });

  const status = quote.isProvisional ? "PENDING_REVIEW" : "AUTO_APPROVED";

  return prisma.internationalQuote.create({
    data: {
      userId,
      productUrl,
      productName,
      productPrice: quote.productPrice,
      productWeight,
      weightSource,
      currency: "USD",
      commissionRate: settings.commissionRate,
      chinaPricePerKg: settings.chinaPricePerKg,
      fixedFee: settings.fixedFee,
      shippingCost: quote.shippingCost,
      customsCost: quote.customsCost,
      commissionCost: quote.commissionCost,
      totalPrice: quote.totalPrice,
      subCategoryId,
      status,
      options: cleanQuoteOptions(options),
      expiresAt: status === "AUTO_APPROVED" ? quoteValidUntil() : null,
      adminNotes: quote.isProvisional
        ? "Poids inconnu : total provisoire, validation admin requise avant confirmation."
        : null,
    },
  });
}

export async function getUserQuotes(userId: string) {
  return prisma.internationalQuote.findMany({
    where: { userId },
    include: {
      subCategory: {
        include: { category: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}