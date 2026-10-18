import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { normalizeWeightKg } from "./pricing.service";

export type QuoteWeightSourceValue = "EXTRACTED" | "CATALOG_ESTIMATE";

/**
 * Poids retenu pour un devis : d'abord celui extrait du site, sinon l'estimation
 * validée du catalogue pour la sous-catégorie. Sinon : inconnu (null), jamais 0.
 */
export async function resolveQuoteWeight(
  extractedWeightKg: number | null | undefined,
  subCategoryId: string
): Promise<{ weight: Prisma.Decimal | null; source: QuoteWeightSourceValue | null }> {
  if (typeof extractedWeightKg === "number" && extractedWeightKg > 0) {
    return { weight: normalizeWeightKg(extractedWeightKg), source: "EXTRACTED" };
  }

  const weightCatalog = await prisma.weightCatalog.findUnique({
    where: { subCategoryId },
  });

  if (
    weightCatalog &&
    Number.isFinite(Number(weightCatalog.estimatedWeightKg)) &&
    Number(weightCatalog.estimatedWeightKg) > 0
  ) {
    return {
      weight: normalizeWeightKg(weightCatalog.estimatedWeightKg),
      source: "CATALOG_ESTIMATE",
    };
  }

  return { weight: null, source: null };
}