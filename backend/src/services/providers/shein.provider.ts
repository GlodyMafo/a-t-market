import { NativeEmblemService } from "../apify/nativeEmblem.service";
import { SheinProductService } from "../apify/sheinProduct.service";

import {
  NormalizedExternalProduct,
  ExternalProductAttribute,
  ExternalProductColor,
  ExternalProductSize,
  ExternalProductSizeDetail,
  ExternalProductVariant,
  ExternalProductVariantAttribute,
  ExternalProductSizeGuide,
} from "../externalProduct.types";

import { ExternalProductProvider } from "../externalProduct.provider";

export class SheinProvider implements ExternalProductProvider {
  source = "SHEIN" as const;

  private nativeEmblemService: NativeEmblemService;
  private sheinProductService: SheinProductService;

  constructor() {
    this.nativeEmblemService = new NativeEmblemService();
    this.sheinProductService = new SheinProductService();
  }

  supports(url: string): boolean {
    try {
      const parsedUrl = new URL(url);

      return parsedUrl.hostname
        .toLowerCase()
        .includes("shein.com");
    } catch {
      return false;
    }
  }

  async fetchProduct(
    url: string
  ): Promise<NormalizedExternalProduct> {
    if (!this.supports(url)) {
      throw new Error(
        "L'URL fournie n'est pas une URL SHEIN valide."
      );
    }

    console.log("\n==========================================");
    console.log("[SHEIN PROVIDER] Début extraction produit");
    console.log("==========================================");

    // =====================================================
    // 1. NATIVE EMBLEM
    // SOURCE DE VÉRITÉ PRINCIPALE
    //
    // Utilisé pour :
    // - goodsId
    // - nom
    // - URL
    // - prix
    // - devise
    // - catégorie
    // - images
    // - rating
    // - reviews
    // =====================================================

    const nativeProduct =
      await this.nativeEmblemService.fetchProduct(url);

    console.log(
      `[SHEIN PROVIDER] goodsId : ${nativeProduct.goodsId}`
    );

    if (
      nativeProduct.price === null ||
      nativeProduct.currency === null
    ) {
      throw new Error(
        "Native Emblem n'a pas retourné le prix ou la devise du produit."
      );
    }

    // =====================================================
    // 2. OMKAR CLOUD
    // ENRICHISSEMENT
    //
    // Utilisé pour :
    // - couleurs
    // - tailles
    // - SKU
    // - variantes
    // - stock
    // - size guide
    // - attributs
    // =====================================================

    let detailedProduct: any = null;

    try {
      detailedProduct =
        await this.sheinProductService.fetchProduct(url);

      console.log(
        "[SHEIN PROVIDER] Omkar Cloud : enrichissement réussi."
      );
    } catch (error) {
      console.warn(
        "[SHEIN PROVIDER] Omkar Cloud indisponible."
      );

      console.warn(
        "[SHEIN PROVIDER] Les données Native Emblem seront utilisées comme fallback."
      );

      console.warn(error);
    }

    // =====================================================
    // 3. IMAGES
    // Fusion Native Emblem + Omkar
    // =====================================================

    const nativeImages = [
      ...(nativeProduct.imageUrl
        ? [nativeProduct.imageUrl]
        : []),

      ...(Array.isArray(nativeProduct.images)
        ? nativeProduct.images
        : []),
    ].filter(
      (image): image is string =>
        typeof image === "string" &&
        image.trim().length > 0
    );

    const omkarImages =
      detailedProduct &&
        Array.isArray(detailedProduct.images)
        ? detailedProduct.images.filter(
          (image: unknown): image is string =>
            typeof image === "string" &&
            image.trim().length > 0
        )
        : [];

    const images = Array.from(
      new Set([
        ...nativeImages,
        ...omkarImages,
      ])
    );

    // =====================================================
    // 4. COULEURS
    // SOURCE : OMKAR
    // =====================================================

    const colors: ExternalProductColor[] =
      detailedProduct &&
        Array.isArray(detailedProduct.colors)
        ? detailedProduct.colors
          .filter(
            (color: any) =>
              color &&
              typeof color.name === "string" &&
              color.name.trim().length > 0
          )
          .map(
            (color: any): ExternalProductColor => ({
              name: color.name.trim(),

              imageUrl:
                typeof color.image === "string"
                  ? color.image
                  : undefined,
            })
          )
        : [];

    // =====================================================
    // 5. TAILLES
    // Liste simple pour le frontend
    // =====================================================

    const sizes: ExternalProductSize[] =
      detailedProduct &&
        Array.isArray(detailedProduct.sizes)
        ? detailedProduct.sizes
          .filter(
            (size: any) =>
              size &&
              typeof size.size === "string" &&
              size.size.trim().length > 0
          )
          .map(
            (size: any): ExternalProductSize => ({
              name: size.size.trim(),

              available:
                typeof size.in_stock === "boolean"
                  ? size.in_stock
                  : typeof size.stock === "number"
                    ? size.stock > 0
                    : true,
            })
          )
        : [];

    // =====================================================
    // 6. DÉTAILS DES TAILLES
    // =====================================================

    const sizeDetails: ExternalProductSizeDetail[] =
      detailedProduct &&
        Array.isArray(detailedProduct.sizes)
        ? detailedProduct.sizes
          .filter(
            (size: any) =>
              size &&
              typeof size.size === "string"
          )
          .map(
            (size: any): ExternalProductSizeDetail => ({
              size: size.size.trim(),

              sku:
                typeof size.sku_code === "string"
                  ? size.sku_code
                  : undefined,

              stock:
                typeof size.stock === "number"
                  ? size.stock
                  : undefined,

              inStock:
                typeof size.in_stock === "boolean"
                  ? size.in_stock
                  : typeof size.stock === "number"
                    ? size.stock > 0
                    : true,

              /*
               * Omkar peut fournir le prix directement
               * comme nombre.
               *
               * IMPORTANT :
               * ce prix ne remplace PAS le prix Native Emblem.
               */

              price:
                typeof size.price === "number"
                  ? size.price
                  : undefined,

              currency:
                typeof detailedProduct.currency === "string"
                  ? detailedProduct.currency
                  : undefined,
            })
          )
        : [];

    // =====================================================
    // 7. VARIANTES
    // =====================================================

    const variants: ExternalProductVariant[] =
      detailedProduct &&
        Array.isArray(detailedProduct.variants)
        ? detailedProduct.variants
          .filter(
            (variant: any) =>
              variant &&
              typeof variant.sku_code === "string"
          )
          .map(
            (variant: any): ExternalProductVariant => {
              const attributes: ExternalProductVariantAttribute[] =
                Array.isArray(variant.attributes)
                  ? variant.attributes
                    .filter(
                      (attribute: any) =>
                        attribute &&
                        typeof attribute.name === "string" &&
                        typeof attribute.value === "string"
                    )
                    .map(
                      (
                        attribute: any
                      ): ExternalProductVariantAttribute => ({
                        name: attribute.name.trim(),
                        value: attribute.value.trim(),
                      })
                    )
                  : [];

              return {
                sku: variant.sku_code,

                attributes,

                price:
                  typeof variant.price === "number"
                    ? variant.price
                    : undefined,

                currency:
                  typeof detailedProduct.currency === "string"
                    ? detailedProduct.currency
                    : undefined,

                stock:
                  typeof variant.stock === "number"
                    ? variant.stock
                    : undefined,

                inStock:
                  typeof variant.in_stock === "boolean"
                    ? variant.in_stock
                    : typeof variant.stock === "number"
                      ? variant.stock > 0
                      : true,

                quickShip:
                  typeof variant.quick_ship === "boolean"
                    ? variant.quick_ship
                    : undefined,
              };
            }
          )
        : [];

    // =====================================================
    // 8. SIZE GUIDE
    // =====================================================

    let sizeGuide: ExternalProductSizeGuide | undefined;

    if (detailedProduct && detailedProduct.size_guide) {
      const measurements =
        Array.isArray(detailedProduct.size_guide.measurements)
          ? detailedProduct.size_guide.measurements
            .filter(
              (measurement: any) =>
                measurement &&
                typeof measurement.attr_value_name === "string"
            )
            .map((measurement: any) => {
              const normalizedMeasurements: Record<string, string> = {};

              for (const [key, value] of Object.entries(measurement)) {
                if (
                  typeof value === "string" &&
                  key !== "attr_id" &&
                  key !== "attr_name" &&
                  key !== "attr_value_id" &&
                  key !== "attr_value_name" &&
                  key !== "attr_value_name_en"
                ) {
                  const normalizedKey = key.trim();

                  if (normalizedKey.length > 0) {
                    normalizedMeasurements[normalizedKey] = value.trim();
                  }
                }
              }

              return {
                size: measurement.attr_value_name.trim(),
                measurements: normalizedMeasurements,
              };
            })
          : [];

      sizeGuide = {
        url:
          typeof detailedProduct.size_guide.size_guide_link === "string"
            ? detailedProduct.size_guide.size_guide_link
            : undefined,
        measurements,
      };
    }

    // =====================================================
    // 9. ATTRIBUTS
    // =====================================================

    const attributes: ExternalProductAttribute[] =
      detailedProduct &&
        Array.isArray(detailedProduct.attributes)
        ? detailedProduct.attributes
          .filter(
            (attribute: any) =>
              attribute &&
              typeof attribute.name === "string" &&
              typeof attribute.value === "string"
          )
          .map(
            (attribute: any): ExternalProductAttribute => ({
              name: attribute.name.trim(),
              value: attribute.value.trim(),
            })
          )
        : [];

    // =====================================================
    // 10. FIT
    // Native Emblem comme fallback
    // =====================================================

    let fit =
      detailedProduct?.fit ?? undefined;

    if (!fit) {
      const nativeFit =
        (nativeProduct.raw as any)?.fit;

      if (nativeFit) {
        fit = {
          overall: {
            true_size:
              nativeFit.trueSize,

            large:
              nativeFit.large,

            small:
              nativeFit.small,
          },

          sizeRecommendations: [],
        };
      }
    }

    // =====================================================
    // 11. STOCK GLOBAL
    // =====================================================

    const inStock =
      detailedProduct &&
        typeof detailedProduct.in_stock === "boolean"
        ? detailedProduct.in_stock
        : nativeProduct.inStock ?? false;

    // =====================================================
    // 12. PRODUIT NORMALISÉ
    // =====================================================

    const normalizedProduct: NormalizedExternalProduct = {
      source: "SHEIN",

      externalId:
        nativeProduct.goodsId,

      url:
        nativeProduct.productUrl ?? url,

      name:
        nativeProduct.title ??
        detailedProduct?.name ??
        "Produit SHEIN",

      category:
        nativeProduct.category ??
        detailedProduct?.category?.name ??
        undefined,

      /*
       * IMPORTANT :
       *
       * Le prix principal vient TOUJOURS
       * de Native Emblem.
       */

      price:
        nativeProduct.price,

      currency:
        nativeProduct.currency,

      images,

      sizes,

      sizeDetails,

      sizeConversions:
        undefined,

      sizeChart:
        undefined,

      sizeGuide,

      colors,

      variants,

      fit,

      attributes,

      inStock,

      rating:
        nativeProduct.rating,

      reviewsCount:
        nativeProduct.reviewsCount,

      raw: {
        nativeEmblem:
          nativeProduct.raw,

        omkarCloud:
          detailedProduct,
      },
    };

    console.log(
      "[SHEIN PROVIDER] Produit normalisé avec succès."
    );

    console.log(
      `[SHEIN PROVIDER] Couleurs : ${colors.length}`
    );

    console.log(
      `[SHEIN PROVIDER] Tailles : ${sizes.length}`
    );

    console.log(
      `[SHEIN PROVIDER] Détails tailles : ${sizeDetails.length}`
    );

    console.log(
      `[SHEIN PROVIDER] Variantes : ${variants.length}`
    );

    console.log(
      `[SHEIN PROVIDER] Images : ${images.length}`
    );

    console.log(
      `[SHEIN PROVIDER] Attributs : ${attributes.length}`
    );

    return normalizedProduct;
  }
}