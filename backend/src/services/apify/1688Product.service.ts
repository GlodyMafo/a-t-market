import { ApifyClient } from "apify-client";
import { APIFY_RUN_OPTIONS } from "./apifyLimits";
import { hostMatchesDomain } from "../productUrl";

import {
    NormalizedExternalProduct,
    ExternalProductAttribute,
    ExternalProductVariant,
} from "../externalProduct.types";

export function map1688Variants(
    skus: unknown
): ExternalProductVariant[] {
    const variants: ExternalProductVariant[] = [];

    if (!Array.isArray(skus)) {
        return variants;
    }

    for (const candidate of skus) {
        if (
            !candidate ||
            typeof candidate !== "object" ||
            (typeof candidate.skuId !== "string" &&
                typeof candidate.specId !== "string")
        ) {
            continue;
        }

        const sku = candidate as Record<string, any>;

        const skuPrice =
            typeof sku.priceCny === "number" &&
                Number.isFinite(sku.priceCny) &&
                sku.priceCny > 0
                ? sku.priceCny
                : undefined;

        const stock =
            typeof sku.stock === "number" &&
                Number.isFinite(sku.stock)
                ? sku.stock
                : undefined;

        const variantName =
            typeof sku.variantEn === "string" &&
                sku.variantEn.trim()
                ? sku.variantEn.trim()
                : typeof sku.variant === "string"
                    ? sku.variant.trim()
                    : "";

        const imageUrl =
            typeof sku.image === "string" &&
                sku.image.trim().length > 0
                ? sku.image.trim()
                : undefined;

        variants.push({
            sku: String(sku.skuId ?? sku.specId),

            attributes: variantName
                ? [
                    {
                        name: "Variant",
                        value: variantName,
                    },
                ]
                : [],

            ...(skuPrice !== undefined
                ? { price: skuPrice }
                : {}),

            currency: "CNY",

            ...(stock !== undefined
                ? { stock }
                : {}),

            inStock:
                stock !== undefined
                    ? stock > 0
                    : true,

            ...(imageUrl
                ? { imageUrl }
                : {}),
        });
    }

    return variants;
}


export class Product1688Service {
    private client: ApifyClient;

    private readonly actorId = "vSKDel6pLyC1P9N83";

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
            throw new Error("L'URL 1688 fournie est invalide.");
        }

        if (
            url.protocol !== "https:" ||
            url.hostname.toLowerCase() !== "detail.1688.com" ||
            !/^\/offer\/\d+\.html$/.test(url.pathname) ||
            !hostMatchesDomain(url.hostname, "1688.com")
        ) {
            throw new Error(
                "L'URL fournie n'est pas une fiche produit 1688 HTTPS valide."
            );
        }

        const canonicalUrl =
            `https://detail.1688.com${url.pathname}`;

        const input = {
            includeVariants: true,
            productUrls: [canonicalUrl],
            translateToEnglish: true,
        };

        console.log(
            "[1688] Début de l'extraction :",
            canonicalUrl
        );

        const run = await this.client
            .actor(this.actorId)
            .call(input, APIFY_RUN_OPTIONS);

        const { items } = await this.client
            .dataset(run.defaultDatasetId)
            .listItems();

        if (!items || items.length === 0) {
            throw new Error(
                "L'Actor 1688 n'a retourné aucun produit."
            );
        }

        const item = items[0] as Record<string, any>;

        if (
            item.type !== "productDetail" ||
            typeof item.productId !== "string"
        ) {
            throw new Error(
                "La réponse de l'Actor 1688 ne contient pas une fiche produit valide."
            );
        }

        const priceMin =
            typeof item.priceMinCny === "number" &&
                Number.isFinite(item.priceMinCny) &&
                item.priceMinCny > 0
                ? item.priceMinCny
                : typeof item.priceCny === "number" &&
                    Number.isFinite(item.priceCny) &&
                    item.priceCny > 0
                    ? item.priceCny
                    : null;

        const priceMax =
            typeof item.priceMaxCny === "number" &&
                Number.isFinite(item.priceMaxCny) &&
                item.priceMaxCny > 0
                ? item.priceMaxCny
                : priceMin;

        if (
            priceMin === null ||
            priceMax === null ||
            priceMax < priceMin
        ) {
            throw new Error(
                "1688 n'a retourné aucune fourchette de prix CNY valide."
            );
        }

        const name =
            typeof item.titleEn === "string" &&
                item.titleEn.trim()
                ? item.titleEn.trim()
                : typeof item.title === "string" &&
                    item.title.trim()
                    ? item.title.trim()
                    : null;

        if (!name) {
            throw new Error(
                "1688 n'a retourné aucun nom de produit valide."
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

        const sourceAttributes = Array.isArray(item.attributesEn)
            ? item.attributesEn
            : Array.isArray(item.attributes)
                ? item.attributes
                : [];

        for (const attribute of sourceAttributes) {
            if (
                attribute &&
                typeof attribute === "object" &&
                typeof attribute.name === "string" &&
                typeof attribute.value === "string"
            ) {
                attributes.push({
                    name: attribute.name.trim(),
                    value: attribute.value.trim(),
                });
            }
        }

        const variants = map1688Variants(item.skus);

        const minOrder =
            typeof item.minOrder === "number" &&
                Number.isFinite(item.minOrder) &&
                item.minOrder > 0
                ? item.minOrder
                : undefined;

        const weightKgMin =
            typeof item.weightKgMin === "number" &&
                Number.isFinite(item.weightKgMin) &&
                item.weightKgMin > 0
                ? item.weightKgMin
                : undefined;

        const weightKgMax =
            typeof item.weightKgMax === "number" &&
                Number.isFinite(item.weightKgMax) &&
                item.weightKgMax > 0
                ? item.weightKgMax
                : undefined;

        const inStock =
            typeof item.inStockSkus === "number"
                ? item.inStockSkus > 0
                : typeof item.stock === "number"
                    ? item.stock > 0
                    : variants.length > 0
                        ? variants.some((variant) => variant.inStock)
                        : false;

        const normalizedProduct: NormalizedExternalProduct = {
            source: "1688",

            externalId: item.productId,

            url: canonicalUrl,

            name,

            description:
                typeof item.descriptionEn === "string"
                    ? item.descriptionEn
                    : typeof item.description === "string"
                        ? item.description
                        : undefined,

            price: priceMin,

            currency: "CNY",

            priceMin,

            priceMax,

            ...(minOrder !== undefined
                ? { minOrderQuantity: minOrder }
                : {}),

            ...(typeof item.unitEn === "string"
                ? { unit: item.unitEn }
                : typeof item.unit === "string"
                    ? { unit: item.unit }
                    : {}),

            ...(weightKgMin !== undefined
                ? { weightKgMin }
                : {}),

            ...(weightKgMax !== undefined
                ? { weightKgMax }
                : {}),

            images,

            sizes: [],

            colors: [],

            variants,

            attributes,

            inStock,

            raw: item,
        };

        console.log("[1688] Produit normalisé :", {
            externalId: normalizedProduct.externalId,
            priceMin: normalizedProduct.priceMin,
            priceMax: normalizedProduct.priceMax,
            currency: normalizedProduct.currency,
            minOrderQuantity: normalizedProduct.minOrderQuantity,
            weightKgMin: normalizedProduct.weightKgMin,
            weightKgMax: normalizedProduct.weightKgMax,
            variantsCount: variants.length,
        });

        return normalizedProduct;
    }
}
