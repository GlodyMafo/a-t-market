
import { prisma } from "../lib/prisma";
import { ExternalProductService } from "./externalProduct.service";
import { NormalizedExternalProduct } from "./externalProduct.types";
import { ExtractionGate, previewExtractionGate } from "./extractionGate";
import { computeQuote } from "./pricing.service";
import {
  inspectProductUrl,
  resolveProductUrl,
} from "./productUrlResolver";
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

  // 1. Inspection syntaxique uniquement : aucun appel réseau ici.
  let inspected: ReturnType<typeof inspectProductUrl>;

  try {
    inspected = inspectProductUrl(input.productUrl);
  } catch (error: any) {
    throw new PreviewInputError(
      error?.message || "Lien produit invalide."
    );
  }

  // 2. Validation de la sous-catégorie.
  const subCategoryId = input.subCategoryId;

  if (
    typeof subCategoryId !== "string" ||
    subCategoryId.length === 0 ||
    subCategoryId.length > 100
  ) {
    throw new PreviewInputError("La sous-catégorie est obligatoire.");
  }

  // 3. Vérification de la configuration et de la sous-catégorie.
  const [settings, subCategory] = await Promise.all([
    prisma.globalSettings.findFirst(),
    prisma.subCategory.findFirst({
      where: {
        id: subCategoryId,
        isActive: true,
        category: { isActive: true },
      },
      select: { id: true },
    }),
  ]);

  if (!subCategory) {
    throw new PreviewInputError(
      "La sous-catégorie sélectionnée est invalide ou inactive."
    );
  }

  if (!settings) {
    throw new Error("Configuration système introuvable");
  }

  // 4. Vérification du provider AVANT toute résolution réseau ou extraction.
  if (!externalProductService.supportsMarketplace(inspected.marketplace)) {
    throw new PreviewInputError(
      `Aucun fournisseur n'est encore disponible pour ${inspected.marketplace}.`
    );
  }

  // 5. Résolution réseau uniquement pour les liens courts.
  let canonicalUrl: string;

  try {
    if (inspected.isShortLink) {
      const resolved = await resolveProductUrl(inspected.url.href);
      canonicalUrl = resolved.canonicalUrl;
    } else {
      canonicalUrl = inspected.url.href;
    }

    // Le parser existant vérifie actuellement les URL SHEIN prises en charge.
    canonicalUrl = parseSupportedProductUrl(canonicalUrl).href;
  } catch (error: any) {
    throw new PreviewInputError(
      error?.message || "Impossible de valider le lien du produit."
    );
  }

  const url = new URL(canonicalUrl);

  // Le callback injecté dans les tests reçoit désormais toujours une URL canonique.
  const fetchProduct =
    deps.fetchProduct ??
    ((canonical: string) =>
      externalProductService.fetchProduct(canonical));

  // 6. Extraction payante uniquement après toutes les validations.
  let product: NormalizedExternalProduct;

  try {
    product = await gate.get(url.href, fetchProduct);
  } catch (error: any) {
    if (error?.name === "ExtractionBudgetExceededError") {
      throw error;
    }

    console.error(
      "[QUOTE PREVIEW] Échec d'extraction :",
      error?.message
    );

    throw new PreviewInputError(
      "Impossible de lire ce produit. Vérifiez le lien et réessayez."
    );
  }

  // Les montants sont en dollars : on refuse toute autre devise.
  // 7. Normalisation de la devise et conversion éventuelle en USD.
  const sourceCurrency = String(product.currency).toUpperCase();
  const sourcePrice = Number(product.price);

  if (!Number.isFinite(sourcePrice) || sourcePrice <= 0) {
    throw new PreviewInputError(
      "Le prix de ce produit n'a pas pu être déterminé."
    );
  }

  if (sourceCurrency !== "USD" && sourceCurrency !== "AED") {
    throw new PreviewInputError(
      "La devise de ce produit n'est pas prise en charge."
    );
  }

  let price = sourcePrice;
  let sourceProductPrice: string | null = null;
  let ticketSourceCurrency: "AED" | null = null;
  let exchangeRate: string | null = null;

  if (sourceCurrency === "AED") {
    const rate = Number(settings.aedToUsdRate);

    if (
      settings.aedToUsdRate === null ||
      !Number.isFinite(rate) ||
      rate <= 0 ||
      rate > 10
    ) {
      throw new PreviewInputError(
        "Le taux de conversion AED vers USD n'est pas configuré correctement."
      );
    }

    price = Math.round(
      (sourcePrice * rate + Number.EPSILON) * 100
    ) / 100;

    if (!Number.isFinite(price) || price <= 0) {
      throw new PreviewInputError(
        "La conversion du prix en USD a échoué."
      );
    }

    sourceProductPrice = sourcePrice.toFixed(2);
    ticketSourceCurrency = "AED";
    exchangeRate = rate.toString();
  }

  const { weight, source } = await resolveQuoteWeight(
    product.weightKg,
    subCategoryId
  );

  const quote = computeQuote({
    productPrice: price,
    weightKg: weight,
    settings,
  });

  const imageUrl = product.images?.[0] ?? null;
  const productName =
    (product.name || "Produit").trim().slice(0, 300) || "Produit";

  const { ticket, expiresAt } = signQuotePreviewTicket(
    {
      productUrl: url.href,
      productName,
      imageUrl:
        imageUrl && imageUrl.length <= 2000 ? imageUrl : null,
      productPrice: quote.productPrice.toString(),
      weightKg: weight ? weight.toString() : null,
      weightSource: source,
      subCategoryId,
      commissionRate: settings.commissionRate.toString(),
      chinaPricePerKg: settings.chinaPricePerKg.toString(),
      fixedFee: settings.fixedFee.toString(),
      sourceProductPrice,
      sourceCurrency: ticketSourceCurrency,
      exchangeRate,
    },
    deps.now
  );

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
      status: quote.isProvisional
        ? "PENDING_REVIEW"
        : "AUTO_APPROVED",
      notice: quote.isProvisional
        ? "Total provisoire : le poids est inconnu. L'équipe doit valider ce prix avant le paiement."
        : null,
      inStock: product.inStock !== false,
      expiresAt: expiresAt.toISOString(),
    },
  };
}
