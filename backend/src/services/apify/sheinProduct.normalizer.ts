
import {
  NativeEmblemProduct,
} from "./nativeEmblem.service";

import {
  NormalizedExternalProduct,
  ExternalProductColor,
  ExternalProductSize,
} from "../externalProduct.types";

/**
 * Type minimal représentant le résultat
 * retourné par le deuxième Actor SHEIN.
 *
 * Nous gardons volontairement les données
 * détaillées du scraper sans imposer une structure
 * trop rigide à Apify.
 */
export interface SheinDetailedProduct {
  productId?: string;
  name?: string;
  url?: string;

  images?: unknown;
  colors?: unknown;
  sizeOptions?: unknown;

  inStock?: boolean;

  attributes?: unknown;
  sizeConversions?: unknown;
  sizeChart?: unknown;
  fit?: unknown;

  [key: string]: unknown;
}

/**
 * Normalise les images retournées par le deuxième Actor.
 *
 * A&T Market limite actuellement le produit
 * à maximum 3 images.
 */
function normalizeImages(
  images: unknown
): string[] {
  if (!Array.isArray(images)) {
    return [];
  }

  return images
    .filter(
      (image): image is string =>
        typeof image === "string" &&
        image.trim().length > 0
    )
    .slice(0, 3);
}

/**
 * Normalise les tailles SHEIN.
 *
 * Exemple reçu :
 *
 * [
 *   {
 *     name: "Size",
 *     values: ["XXS", "XS", "S", "M", "L", "XL"]
 *   }
 * ]
 */
function normalizeSizes(
  sizeOptions: unknown
): ExternalProductSize[] {
  if (!Array.isArray(sizeOptions)) {
    return [];
  }

  const sizes: ExternalProductSize[] = [];

  for (const option of sizeOptions) {
    if (
      !option ||
      typeof option !== "object"
    ) {
      continue;
    }

    const values =
      (option as Record<string, unknown>).values;

    if (!Array.isArray(values)) {
      continue;
    }

    for (const value of values) {
      if (
        typeof value !== "string" ||
        !value.trim()
      ) {
        continue;
      }

      sizes.push({
        name: value.trim(),
        available: true,
      });
    }
  }

  /**
   * Évite les doublons.
   */
  return Array.from(
    new Map(
      sizes.map((size) => [
        size.name,
        size,
      ])
    ).values()
  );
}

/**
 * Normalise les couleurs.
 *
 * Le deuxième Actor retourne actuellement
 * des objets pouvant ressembler à :
 *
 * {
 *   productId: "...",
 *   image: "...",
 *   name: null
 * }
 */
function normalizeColors(
  colors: unknown
): ExternalProductColor[] {
  if (!Array.isArray(colors)) {
    return [];
  }

  const normalized: ExternalProductColor[] = [];

  for (const color of colors) {
    if (
      !color ||
      typeof color !== "object"
    ) {
      continue;
    }

    const item =
      color as Record<string, unknown>;

    const name =
      typeof item.name === "string"
        ? item.name.trim()
        : "";

    const imageUrl =
      typeof item.image === "string"
        ? item.image.trim()
        : undefined;

    /**
     * Pour le moment, si SHEIN ne fournit pas
     * le nom de la couleur, nous ne l'inventons pas.
     *
     * On peut néanmoins conserver l'image.
     */
    if (!name && !imageUrl) {
      continue;
    }

    normalized.push({
      name: name || "Unknown",
      ...(imageUrl
        ? { imageUrl }
        : {}),
    });
  }

  return normalized;
}

/**
 * Fusionne les données de Native Emblem
 * et du deuxième Actor SHEIN.
 *
 * RÈGLE IMPORTANTE :
 *
 * Le prix et la devise viennent TOUJOURS
 * de Native Emblem.
 */
export function normalizeSheinProduct(
  nativeProduct: NativeEmblemProduct,
  detailedProduct: SheinDetailedProduct
): NormalizedExternalProduct {
  /**
   * ---------------------------------------------------
   * VALIDATION DU PRIX
   * ---------------------------------------------------
   *
   * Nous refusons de créer un produit normalisé
   * si Native Emblem n'a pas fourni de prix.
   */
  if (
    typeof nativeProduct.price !== "number"
  ) {
    throw new Error(
      `Prix SHEIN indisponible pour le produit ${nativeProduct.goodsId}.`
    );
  }

  /**
   * ---------------------------------------------------
   * VALIDATION DE LA DEVISE
   * ---------------------------------------------------
   */
  if (
    typeof nativeProduct.currency !== "string" ||
    !nativeProduct.currency.trim()
  ) {
    throw new Error(
      `Devise SHEIN indisponible pour le produit ${nativeProduct.goodsId}.`
    );
  }

  /**
   * ---------------------------------------------------
   * NOM
   * ---------------------------------------------------
   *
   * Native Emblem reste notre source principale
   * pour les informations générales.
   */
  const name =
    nativeProduct.title ??
    detailedProduct.name;

  if (
    typeof name !== "string" ||
    !name.trim()
  ) {
    throw new Error(
      `Nom du produit SHEIN indisponible pour ${nativeProduct.goodsId}.`
    );
  }

  /**
   * ---------------------------------------------------
   * URL
   * ---------------------------------------------------
   */
  const url =
    nativeProduct.productUrl;

  if (
    typeof url !== "string" ||
    !url.trim()
  ) {
    throw new Error(
      `URL du produit SHEIN indisponible pour ${nativeProduct.goodsId}.`
    );
  }

  /**
   * ---------------------------------------------------
   * IMAGES
   * ---------------------------------------------------
   *
   * Les images détaillées viennent du deuxième Actor.
   *
   * Maximum 3 images.
   */
  const images =
    normalizeImages(
      detailedProduct.images
    );

  /**
   * ---------------------------------------------------
   * TAILLES
   * ---------------------------------------------------
   */
  const sizes =
    normalizeSizes(
      detailedProduct.sizeOptions
    );

  /**
   * ---------------------------------------------------
   * COULEURS
   * ---------------------------------------------------
   */
  const colors =
    normalizeColors(
      detailedProduct.colors
    );

  /**
   * ---------------------------------------------------
   * PRODUIT NORMALISÉ
   * ---------------------------------------------------
   */
  return {
    source: "SHEIN",

    externalId:
      nativeProduct.goodsId,

    url,

    name: name.trim(),

    price:
      nativeProduct.price,

    currency:
      nativeProduct.currency.trim(),

    images,

    sizes,

    colors,

    inStock:
      typeof detailedProduct.inStock === "boolean"
        ? detailedProduct.inStock
        : nativeProduct.inStock === true,

    rating:
      nativeProduct.rating ?? undefined,

    reviewsCount:
      nativeProduct.reviewsCount ?? undefined,

    raw: {
      nativeEmblem: nativeProduct.raw,
      sheinProductScraper: detailedProduct,
    },
  };
}

