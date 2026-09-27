import { ApifyClient } from "apify-client";

export interface NativeEmblemProduct {
  goodsId: string;
  title: string | null;
  productUrl: string | null;
  imageUrl: string | null;
  images: string[];
  price: number | null;
  currency: string | null;
  category: string | null;
  categoryId: string | null;
  rating: number | null;
  reviewsCount: number | null;
  inStock: boolean | null;
  raw: unknown;
}

export class NativeEmblemService {
  private client: ApifyClient;

  private readonly actorId = "5BDKbqx8RGKFY2JxY";

  constructor() {
    const token = process.env.APIFY_API_TOKEN;

    if (!token) {
      throw new Error(
        "APIFY_API_TOKEN n'est pas configuré dans les variables d'environnement."
      );
    }

    this.client = new ApifyClient({
      token,
    });
  }

  async fetchProduct(
    productUrl: string
  ): Promise<NativeEmblemProduct> {
    if (!productUrl) {
      throw new Error(
        "L'URL du produit SHEIN est obligatoire."
      );
    }

    let url: URL;

    try {
      url = new URL(productUrl);
    } catch {
      throw new Error(
        "L'URL SHEIN fournie est invalide."
      );
    }

    if (!url.hostname.toLowerCase().includes("shein.com")) {
      throw new Error(
        "L'URL fournie n'est pas une URL SHEIN."
      );
    }

    const input = {
      productUrls: [productUrl],
      maxItems: 1,
    };

    console.log(
      "\n[Native Emblem] Recherche du produit..."
    );

    console.log(
      `[Native Emblem] URL : ${productUrl}`
    );

    const run = await this.client
      .actor(this.actorId)
      .call(input);

    console.log(
      "[Native Emblem] Actor terminé."
    );

    const { items } = await this.client
      .dataset(run.defaultDatasetId)
      .listItems();

    if (!items || items.length === 0) {
      throw new Error(
        "Native Emblem n'a retourné aucun produit."
      );
    }

    const item = items[0] as Record<string, any>;

    const goodsId = item.goodsId ?? item.id;

    if (!goodsId) {
      throw new Error(
        "Native Emblem n'a retourné aucun goodsId."
      );
    }

    return {
      goodsId: String(goodsId),

      title:
        item.title ??
        item.name ??
        null,

      productUrl:
        item.productUrl ??
        item.url ??
        productUrl,

      imageUrl:
        item.imageUrl ??
        item.mainImage ??
        item.image ??
        null,

      images:
        Array.isArray(item.images)
          ? item.images
          : [],

      price:
        typeof item.price === "number"
          ? item.price
          : typeof item.salePrice === "number"
            ? item.salePrice
            : null,

      currency:
        item.currency ??
        null,

      category:
        item.category ??
        null,

      categoryId:
        item.categoryId
          ? String(item.categoryId)
          : null,

      rating:
        typeof item.rating === "number"
          ? item.rating
          : null,

      reviewsCount:
        typeof item.reviewsCount === "number"
          ? item.reviewsCount
          : typeof item.reviewCount === "number"
            ? item.reviewCount
            : null,

      inStock:
        typeof item.inStock === "boolean"
          ? item.inStock
          : null,

      raw: item,
    };
  }
}