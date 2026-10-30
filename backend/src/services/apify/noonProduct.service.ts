
import { ApifyClient } from "apify-client";
import { APIFY_RUN_OPTIONS } from "./apifyLimits";
import { hostMatchesDomain } from "../productUrl";

import {
  NormalizedExternalProduct,
  ExternalProductAttribute,
} from "../externalProduct.types";

export class NoonProductService {
  private client: ApifyClient;

  private readonly actorId = "hqVJqZGCaauVJcamD";

  constructor() {
    const token = process.env.APIFY_API_TOKEN;

    if (!token) {
      throw new Error(
        "APIFY_API_TOKEN n'est pas configuré."
      );
    }

    this.client = new ApifyClient({ token });
  }

  async fetchProduct(
    productUrl: string
  ): Promise<NormalizedExternalProduct> {
    let url: URL;

    try {
      url = new URL(productUrl);
    } catch {
      throw new Error("L'URL NOON fournie est invalide.");
    }

    if (
      url.protocol !== "https:" ||
      !hostMatchesDomain(url.hostname, "noon.com")
    ) {
      throw new Error(
        "L'URL fournie n'est pas une URL NOON HTTPS valide."
      );
    }

    const input = {
      scrapeDetails: false,
      startUrls: [url.href],
      country: "uae",
      maxItems: 1,
      maxConcurrency: 1,
    };

    console.log("[NOON] Début de l'extraction :", url.href);

    const run = await this.client
      .actor(this.actorId)
      .call(input, APIFY_RUN_OPTIONS);

    const { items } = await this.client
      .dataset(run.defaultDatasetId)
      .listItems();

    if (!items || items.length === 0) {
      throw new Error(
        "L'Actor NOON n'a retourné aucun produit."
      );
    }

    const item = items[0] as Record<string, any>;

    const salePrice =
      typeof item.salePrice === "number" &&
      Number.isFinite(item.salePrice) &&
      item.salePrice > 0
        ? item.salePrice
        : null;

    const regularPrice =
      typeof item.price === "number" &&
      Number.isFinite(item.price) &&
      item.price > 0
        ? item.price
        : null;

    const productPrice = salePrice ?? regularPrice;

    if (productPrice === null) {
      throw new Error(
        "NOON n'a retourné aucun prix valide."
      );
    }

    if (item.currency !== "AED") {
      throw new Error(
        "La devise retournée par NOON est absente ou différente de AED."
      );
    }

    const title =
      typeof item.title === "string" &&
      item.title.trim().length > 0
        ? item.title.trim()
        : null;

    if (!title) {
      throw new Error(
        "NOON n'a retourné aucun nom de produit valide."
      );
    }

    const images = Array.from(
      new Set(
        [
          ...(typeof item.image === "string"
            ? [item.image]
            : []),

          ...(Array.isArray(item.images)
            ? item.images
            : []),
        ].filter(
          (image): image is string =>
            typeof image === "string" &&
            image.trim().length > 0
        )
      )
    );

    const attributes: ExternalProductAttribute[] = [];

    if (Array.isArray(item.specifications)) {
      for (const specification of item.specifications) {
        if (
          specification &&
          typeof specification.name === "string" &&
          typeof specification.value === "string"
        ) {
          attributes.push({
            name: specification.name.trim(),
            value: specification.value.trim(),
          });
        }
      }
    }

    if (Array.isArray(item.featureBullets)) {
      item.featureBullets.forEach(
        (feature: unknown, index: number) => {
          if (
            typeof feature === "string" &&
            feature.trim().length > 0
          ) {
            attributes.push({
              name: `Caractéristique ${index + 1}`,
              value: feature.trim(),
            });
          }
        }
      );
    }

    const inStock =
      typeof item.isBuyable === "boolean"
        ? item.isBuyable
        : typeof item.stock === "number"
          ? item.stock > 0
          : false;

    const normalizedProduct: NormalizedExternalProduct = {
      source: "NOON",

      externalId:
        typeof item.sku === "string"
          ? item.sku
          : typeof item.catalogSku === "string"
            ? item.catalogSku
            : undefined,

      url: url.href,

      name: title,

      description:
        typeof item.description === "string"
          ? item.description
          : undefined,

      category:
        typeof item.category === "string"
          ? item.category
          : undefined,

      price: productPrice,

      currency: "AED",

      images,

      sizes: [],

      colors: [],

      attributes,

      inStock,

      rating:
        typeof item.productRating === "number"
          ? item.productRating
          : undefined,

      reviewsCount:
        typeof item.productRatingCount === "number"
          ? item.productRatingCount
          : undefined,

      raw: {
        ...item,
        appliedPriceRule: salePrice !== null
          ? "salePrice"
          : "price",
      },
    };

    console.log("[NOON] Produit normalisé :", {
      externalId: normalizedProduct.externalId,
      price: normalizedProduct.price,
      currency: normalizedProduct.currency,
      inStock: normalizedProduct.inStock,
    });

    return normalizedProduct;
  }
}
