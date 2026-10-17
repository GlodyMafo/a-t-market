import { prisma } from "../lib/prisma";
import { Prisma } from "../../generated/prisma/client";
import { computeQuote, normalizeWeightKg } from "./pricing.service";

/** Un devis ne peut être payé que s'il est validé (automatiquement ou par un admin). */
export const PAYABLE_QUOTE_STATUSES = ["AUTO_APPROVED", "APPROVED"] as const;

export function isQuotePayable(status: string): boolean {
  return (PAYABLE_QUOTE_STATUSES as readonly string[]).includes(status);
}

export async function createInternationalQuote(
  userId: string,
  productUrl: string,
  productName: string,
  productPrice: number,
  subCategoryId: string,
  extractedWeightKg?: number
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

  // Poids : d'abord celui extrait du site, sinon l'estimation validée du catalogue.
  // On garde aussi la SOURCE du poids, pour savoir plus tard s'il est réel ou estimé.
  let productWeight: Prisma.Decimal | null = null;
  let weightSource: "EXTRACTED" | "CATALOG_ESTIMATE" | null = null;

  if (typeof extractedWeightKg === "number" && extractedWeightKg > 0) {
    productWeight = normalizeWeightKg(extractedWeightKg);
    weightSource = "EXTRACTED";
  } else {
    const weightCatalog = await prisma.weightCatalog.findUnique({
      where: { subCategoryId },
    });

    if (
      weightCatalog &&
      Number.isFinite(Number(weightCatalog.estimatedWeightKg)) &&
      Number(weightCatalog.estimatedWeightKg) > 0
    ) {
      productWeight = normalizeWeightKg(weightCatalog.estimatedWeightKg);
      weightSource = "CATALOG_ESTIMATE";
    }
  }

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