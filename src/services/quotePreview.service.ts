
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";

import { ExternalProductService } from "./externalProduct.service";
import { NormalizedExternalProduct } from "./externalProduct.types";
import {
  ExtractionGate,
  previewExtractionGate,
} from "./extractionGate";
import { computeQuote } from "./pricing.service";
import {
  inspectProductUrl,
  resolveProductUrl,
} from "./productUrlResolver";
import { parseSupportedProductUrl } from "./productUrl";
import { resolveQuoteWeight } from "./quoteWeight";
import { signQuotePreviewTicket } from "./quotePreviewTicket";
import { decideQuoteStatus, REVIEW_NOTICE } from "./quoteDecision";
import { prepareVariantPricing } from "./quoteVariants";
import { buildProductDetails, stockLimitOf } from "./quoteDetails";

/** Erreur dont le message peut être montré tel quel à un visiteur anonyme. */
export class PreviewInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewInputError";
  }
}

const externalProductService = new ExternalProductService();

type VariantPricingResult = ReturnType<typeof prepareVariantPricing>;

export interface QuotePreview {
  productUrl: string;
  productName: string;
  imageUrl: string | null;
  imageUrls: string[];
  details: ReturnType<typeof buildProductDetails>;
  stockLimit: number | null;
  variantOptions: VariantPricingResult["variantOptions"];
  minOrderQuantity: number | null;
  maxTotalPrice: string | null;
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

/**
 * Photos de l'aperçu : HTTPS uniquement, sans doublon, bornées.
 * Elles ne sont jamais incluses dans le ticket signé.
 */
function previewImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];

  const seen = new Set<string>();

  for (const item of images) {
    if (typeof item !== "string") continue;

    const url = item.trim().replace(/^http:\/\//i, "https://");

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
 * Aperçu de prix pour un visiteur (avec ou sans compte) :
 * calcule et renvoie un ticket signé.
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

    canonicalUrl = parseSupportedProductUrl(canonicalUrl).href;
  } catch (error: any) {
    throw new PreviewInputError(
      error?.message || "Impossible de valider le lien du produit."
    );
  }

  const url = new URL(canonicalUrl);

  // Le callback injecté dans les tests reçoit toujours une URL canonique.
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

  // 7. Détermination du taux de conversion.
  let rate = 1;

  let sourceProductPrice: string | null = null;
  let ticketSourceCurrency: "AED" | "CNY" | null = null;
  let exchangeRate: string | null = null;

  if (sourceCurrency === "AED") {
    rate = Number(settings.aedToUsdRate);

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

    ticketSourceCurrency = "AED";
  }

  if (sourceCurrency === "CNY") {
    rate = Number(settings.cnyToUsdRate);

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

    ticketSourceCurrency = "CNY";
  }

  // 8. Conversion USD commune au prix principal et aux variantes.
  const toUsd = (value: number) =>
    new Prisma.Decimal(
      sourceCurrency === "USD" ? value : value * rate
    )
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      .toString();

  const price = Number(toUsd(basePrice));

  if (!Number.isFinite(price) || price <= 0) {
    throw new PreviewInputError(
      "La conversion du prix en USD a échoué."
    );
  }

  if (sourceCurrency !== "USD") {
    sourceProductPrice = basePrice.toFixed(2);
    exchangeRate = rate.toString();
  }

  // 9. Préparation des prix des variantes.
  const variantData = prepareVariantPricing({
    product,
    sourceCurrency,
    toUsd,
    basePriceUsd: String(price),
  });

  const unitPrice =
    variantData.ticketFields.productPrice ?? String(price);

  const extractedWeight =
    product.source === "1688"
      ? product.weightKgMax
      : product.weightKg;

  const { weight, source } = await resolveQuoteWeight(
    extractedWeight,
    null
  );

  // 10. Calcul du devis avec le prix unitaire retenu.
  const quote = computeQuote({
    productPrice: unitPrice,
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

  // 11. Construction des détails et récupération de la limite de stock.
  const details = buildProductDetails(product);
  const stockLimit = stockLimitOf(product);

  // 12. Données du ticket.
  const ticketData = {
    productUrl: url.href,
    productName,
    imageUrl:
      imageUrl && imageUrl.length <= 2000 ? imageUrl : null,
    productPrice: unitPrice,
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

    ...(stockLimit !== null ? { stockLimit } : {}),

    ...(variantData.ticketFields.variantPrices
      ? {
          variantPrices: variantData.ticketFields.variantPrices,
        }
      : {}),

    ...(variantData.ticketFields.variantTable
      ? {
          variantTable: variantData.ticketFields.variantTable,
        }
      : {}),

    ...(variantData.ticketFields.variantRequired
      ? {
          variantRequired: true,
        }
      : {}),
  };

  // 13. Signature du ticket.
  const { ticket, expiresAt } = signQuotePreviewTicket(
    ticketData,
    deps.now
  );

  // 14. Retour de l'aperçu.
  return {
    ticket,
    preview: {
      productUrl: url.href,
      productName,
      imageUrl,
      imageUrls: previewImages(product.images),
      details,
      stockLimit,

      variantOptions: variantData.variantOptions,

      minOrderQuantity: ticketData.minOrderQuantity ?? null,

      maxTotalPrice: variantData.maxPriceUsd
        ? computeQuote({
            productPrice: variantData.maxPriceUsd,
            weightKg: weight,
            settings,
          }).totalPrice.toString()
        : null,

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
