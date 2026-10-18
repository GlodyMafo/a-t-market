import { prisma } from "../lib/prisma";
import { ExternalProductService } from "./externalProduct.service";
import { NormalizedExternalProduct } from "./externalProduct.types";
import { ExtractionGate, previewExtractionGate } from "./extractionGate";
import { computeQuote } from "./pricing.service";
import { parseSupportedProductUrl } from "./productUrl";
import { resolveQuoteWeight } from "./quoteWeight";
import { signQuotePreviewTicket } from "./quotePreviewTicket";

/** Erreur dont le message peut être montré tel quel à un visiteur anonyme. */
export class PreviewInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewInputError";
  }
}

const externalProductService = new ExternalProductService();

export interface QuotePreview {
  productUrl: string;
  productName: string;
  imageUrl: string | null;
  currency: "USD";
  productPrice: string;
  shippingCost: string;
  customsCost: string;
  commissionCost: string;
  fixedFee: string;
  totalPrice: string;
  isProvisional: boolean;
  weightKg: string | null;
  weightSource: "EXTRACTED" | "CATALOG_ESTIMATE" | null;
  status: "AUTO_APPROVED" | "PENDING_REVIEW";
  notice: string | null;
  inStock: boolean;
  expiresAt: string;
}

export interface PreviewDeps {
  gate?: ExtractionGate;
  fetchProduct?: (url: string) => Promise<NormalizedExternalProduct>;
  now?: Date;
}

/**
 * Aperçu de prix pour un visiteur (avec ou sans compte) : calcule et renvoie un ticket signé.
 * N'ÉCRIT RIEN en base de données.
 */
export async function previewInternationalQuote(
  input: { productUrl?: unknown; subCategoryId?: unknown },
  deps: PreviewDeps = {}
): Promise<{ ticket: string; preview: QuotePreview }> {
  const gate = deps.gate ?? previewExtractionGate;
  const fetchProduct =
    deps.fetchProduct ?? ((url: string) => externalProductService.fetchProduct(url));

  let url: URL;
  try {
    url = parseSupportedProductUrl(input.productUrl);
  } catch (error: any) {
    throw new PreviewInputError(error.message);
  }

  const subCategoryId = input.subCategoryId;
  if (typeof subCategoryId !== "string" || subCategoryId.length === 0 || subCategoryId.length > 100) {
    throw new PreviewInputError("La sous-catégorie est obligatoire.");
  }

  const [settings, subCategory] = await Promise.all([
    prisma.globalSettings.findFirst(),
    prisma.subCategory.findFirst({
      where: { id: subCategoryId, isActive: true, category: { isActive: true } },
      select: { id: true },
    }),
  ]);

  if (!subCategory) {
    throw new PreviewInputError("La sous-catégorie sélectionnée est invalide ou inactive.");
  }

  if (!settings) {
    throw new Error("Configuration système introuvable");
  }

  // L'extraction (payante) n'a lieu qu'APRÈS toutes les validations ci-dessus.
  // Les erreurs du budget quotidien remontent telles quelles (ExtractionBudgetExceededError).
  let product: NormalizedExternalProduct;
  try {
    product = await gate.get(url.href, fetchProduct);
  } catch (error: any) {
    if (error?.name === "ExtractionBudgetExceededError") throw error;
    console.error("[QUOTE PREVIEW] Échec d'extraction :", error?.message);
    throw new PreviewInputError(
      "Impossible de lire ce produit. Vérifiez le lien et réessayez."
    );
  }

  // Les montants sont en dollars : on refuse toute autre devise au lieu de l'interpréter comme des USD.
  if (String(product.currency).toUpperCase() !== "USD") {
    throw new PreviewInputError("La devise de ce produit n'est pas prise en charge.");
  }

  const price = Number(product.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new PreviewInputError("Le prix de ce produit n'a pas pu être déterminé.");
  }

  const { weight, source } = await resolveQuoteWeight(product.weightKg, subCategoryId);

  const quote = computeQuote({ productPrice: price, weightKg: weight, settings });

  const imageUrl = product.images?.[0] ?? null;
  const productName = (product.name || "Produit").trim().slice(0, 300) || "Produit";

  const { ticket, expiresAt } = signQuotePreviewTicket({
    productUrl: url.href,
    productName,
    imageUrl: imageUrl && imageUrl.length <= 2000 ? imageUrl : null,
    productPrice: quote.productPrice.toString(),
    weightKg: weight ? weight.toString() : null,
    weightSource: source,
    subCategoryId,
    commissionRate: settings.commissionRate.toString(),
    chinaPricePerKg: settings.chinaPricePerKg.toString(),
    fixedFee: settings.fixedFee.toString(),
  }, deps.now);

  return {
    ticket,
    preview: {
      productUrl: url.href,
      productName,
      imageUrl,
      currency: "USD",
      productPrice: quote.productPrice.toString(),
      shippingCost: quote.shippingCost.toString(),
      customsCost: quote.customsCost.toString(),
      commissionCost: quote.commissionCost.toString(),
      fixedFee: quote.fixedFee.toString(),
      totalPrice: quote.totalPrice.toString(),
      isProvisional: quote.isProvisional,
      weightKg: weight ? weight.toString() : null,
      weightSource: source,
      status: quote.isProvisional ? "PENDING_REVIEW" : "AUTO_APPROVED",
      notice: quote.isProvisional
        ? "Total provisoire : le poids est inconnu. L'équipe doit valider ce prix avant le paiement."
        : null,
      inStock: product.inStock !== false,
      expiresAt: expiresAt.toISOString(),
    },
  };
}