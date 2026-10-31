
import { Product1688Service } from "../apify/1688Product.service";
import { parseSupportedProductUrl } from "../productUrl";

import { ExternalProductProvider } from "../externalProduct.provider";
import { NormalizedExternalProduct } from "../externalProduct.types";

export class Product1688Provider implements ExternalProductProvider {
  source = "1688" as const;

  private product1688Service: Product1688Service;

  constructor() {
    this.product1688Service = new Product1688Service();
  }

  supports(url: string): boolean {
    try {
      const parsedUrl = parseSupportedProductUrl(url);

      return (
        parsedUrl.protocol === "https:" &&
        parsedUrl.hostname.toLowerCase() === "detail.1688.com"
      );
    } catch {
      return false;
    }
  }

  async fetchProduct(
    url: string
  ): Promise<NormalizedExternalProduct> {
    if (!this.supports(url)) {
      throw new Error(
        "L'URL fournie n'est pas une URL de fiche produit 1688 valide."
      );
    }

    return this.product1688Service.fetchProduct(url);
  }
}
