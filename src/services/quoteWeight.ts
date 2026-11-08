import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { normalizeWeightKg } from "./pricing.service";

export type QuoteWeightSourceValue = "EXTRACTED" | "CATALOG_ESTIMATE";

/**
 * Poids retenu : celui lu sur la fiche du produit, sinon (uniquement si une sous-catégorie fiable est
 * fournie par le serveur lui-même) l'estimation validée du catalogue, sinon inconnu (null, jamais 0).
 */
export async function resolveQuoteWeight(
  extractedWeightKg: number | null | undefined,
  subCategoryId?: string | null
): Promise<{ weight: Prisma.Decimal | null; source: QuoteWeightSourceValue | null }> {
  if (typeof extractedWeightKg === "number" && extractedWeightKg > 0) {
    return { weight: normalizeWeightKg(extractedWeightKg), source: "EXTRACTED" };
  }
  if (!subCategoryId) return { weight: null, source: null };

  const weightCatalog = await prisma.weightCatalog.findUnique({ where: { subCategoryId } });
  if (weightCatalog && Number(weightCatalog.estimatedWeightKg) > 0) {
    return { weight: normalizeWeightKg(weightCatalog.estimatedWeightKg), source: "CATALOG_ESTIMATE" };
  }
  return { weight: null, source: null };
}