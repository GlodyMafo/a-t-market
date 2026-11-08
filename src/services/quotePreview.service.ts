
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
import { decideQuoteStatus, REVIEW_NOTICE } from "./quoteDecision";
import { buildVariantOptions, highestVariantPrice } from "./quoteVariants";

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
  imageUrls: string[];
  variantOptions: ReturnType<typeof buildVariantOptions>;
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

const MAX_PREVIEW_IMAGES = 24;

/** Photos de l'aperçu : HTTPS uniquement, sans doublon, bornées. Elles ne sont jamais incluses dans le ticket signé. */
function previewImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];

  const seen = new Set<string>();

  for (const item of images) {
    if (typeof item !== "string") continue;

    const url = item.trim().replace(/^\/\//, "https://");

    if (
      !/^https:\/\//i.test(url) ||
      url.length > 2000 ||
      seen.has(url)
    ) {
      continue;
    }

    seen.add(url);

    if (seen.size >= MAX_PREVIEW_IMAGES) break;
  }

  return [...seen];
}

/**
 * Aperçu de prix pour un visiteur (avec ou sans compte) : calcule et renvoie un ticket signé.
 * N'ÉCRIT RIEN en base de données.
 */
export async function previewInternationalQuote(
  input: { productUrl?: unknown },
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

  // 2. Récupération de la configuration.
  const settings = await prisma.globalSettings.findFirst();

  if (!settings) {
    throw new Error("Configuration système introuvable");
  }

  // 3. Vérification du provider AVANT toute résolution réseau ou extraction.
  if (!externalProductService.supportsMarketplace(inspected.marketplace)) {
    throw new PreviewInputError(
      `Aucun fournisseur n'est encore disponible pour ${inspected.marketplace}.`
    );
  }

  // 4. Résolution réseau uniquement pour les liens courts.
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

  // 5. Extraction payante uniquement après toutes les validations.
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

  // 6. Normalisation de la devise et validation du prix de base.
  const sourceCurrency = String(product.currency).toUpperCase();
  const basePrice = Number(product.price);

  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    throw new PreviewInputError(
      "Le prix de ce produit n'a pas pu être déterminé."
    );
  }

  if (
    sourceCurrency !== "USD" &&
    sourceCurrency !== "AED" &&
    sourceCurrency !== "CNY"
  ) {
    throw new PreviewInputError(
      "La devise de ce produit n'est pas prise en charge."
    );
  }

  // Prix prudent : le plus élevé entre le produit et ses variantes en stock.
  const sourcePrice = highestVariantPrice(
    product.variants,
    sourceCurrency,
    basePrice
  );

  let price = sourcePrice;
  let sourceProductPrice: string | null = null;
  let ticketSourceCurrency: "AED" | "CNY" | null = null;
  let exchangeRate: string | null = null;

  // Conversion AED vers USD.
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

  // Conversion CNY vers USD.
  if (sourceCurrency === "CNY") {
    const rate = Number(settings.cnyToUsdRate);

    if (
      settings.cnyToUsdRate === null ||
      !Number.isFinite(rate) ||
      rate <= 0 ||
      rate > 10
    ) {
      throw new PreviewInputError(
        "Le taux de conversion CNY vers USD n'est pas configuré correctement."
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
    ticketSourceCurrency = "CNY";
    exchangeRate = rate.toString();
  }

  const extractedWeight =
    product.source === "1688"
      ? product.weightKgMax
      : product.weightKg;

  const { weight, source } = await resolveQuoteWeight(
    extractedWeight,
    null
  );

  const quote = computeQuote({
    productPrice: price,
    weightKg: weight,
    settings,
  });

  const decision = decideQuoteStatus({
    isProvisional: quote.isProvisional,
    totalPrice: quote.totalPrice,
    autoApproveMaxUsd: settings.autoApproveMaxUsd,
  });

  const imageUrl = product.images?.[0] ?? null;

  const productName =
    (product.name || "Produit").trim().slice(0, 300) || "Produit";

  // Le ticket signé conserve exactement sa structure précédente.
  const { ticket, expiresAt } = signQuotePreviewTicket(
    {
      productUrl: url.href,
      productName,
      imageUrl:
        imageUrl && imageUrl.length <= 2000 ? imageUrl : null,
      productPrice: quote.productPrice.toString(),
      weightKg: weight ? weight.toString() : null,
      weightSource: source,
      subCategoryId: null,
      commissionRate: settings.commissionRate.toString(),
      chinaPricePerKg: settings.chinaPricePerKg.toString(),
      fixedFee: settings.fixedFee.toString(),
      sourceProductPrice,
      sourceCurrency: ticketSourceCurrency,
      exchangeRate,
      minOrderQuantity:
        product.source === "1688" &&
        Number.isInteger(product.minOrderQuantity) &&
        Number(product.minOrderQuantity) > 0
          ? product.minOrderQuantity
          : null,
    },
    deps.now
  );

  return {
    ticket,
    preview: {
      productUrl: url.href,
      productName,
      imageUrl,
      imageUrls: previewImages(product.images),
      variantOptions: buildVariantOptions(
        product,
        sourcePrice > basePrice
      ),
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
      status: decision.status,
      notice: decision.reason
        ? REVIEW_NOTICE[decision.reason]
        : null,
      inStock: product.inStock !== false,
      expiresAt: expiresAt.toISOString(),
    },
  };
}
