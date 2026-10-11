
import { prisma } from "../lib/prisma";

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

  let productWeight: number | null = null;

  if (
    typeof extractedWeightKg === "number" &&
    Number.isFinite(extractedWeightKg) &&
    extractedWeightKg > 0
  ) {
    productWeight = extractedWeightKg;
  } else {
    const weightCatalog = await prisma.weightCatalog.findUnique({
      where: { subCategoryId },
    });

    if (
      weightCatalog &&
      Number.isFinite(Number(weightCatalog.estimatedWeightKg)) &&
      Number(weightCatalog.estimatedWeightKg) > 0
    ) {
      productWeight = Number(weightCatalog.estimatedWeightKg);
    }
  }

  const hasKnownWeight = productWeight !== null;

  const shippingCost = hasKnownWeight
    ? productWeight * Number(settings.chinaPricePerKg)
    : 0;

  const commissionCost =
    productPrice * (Number(settings.commissionRate) / 100);

  // Les frais de douane sont déjà inclus dans la livraison.
  const customsCost = 0;

  const totalPrice =
    productPrice +
    shippingCost +
    commissionCost +
    customsCost +
    Number(settings.fixedFee);

  const status = hasKnownWeight
    ? "AUTO_APPROVED"
    : "PENDING_REVIEW";

  return prisma.internationalQuote.create({
    data: {
      userId,
      productUrl,
      productName,
      productPrice,
      productWeight,
      shippingCost,
      customsCost,
      commissionCost,
      totalPrice,
      subCategoryId,
      status,
      adminNotes: hasKnownWeight
        ? null
        : "Poids inconnu : total provisoire, validation admin requise avant confirmation.",
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
