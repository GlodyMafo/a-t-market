
import { NoonProductService } from "../apify/noonProduct.service";
import { hostMatchesDomain } from "../productUrl";

import { ExternalProductProvider } from "../externalProduct.provider";
import { NormalizedExternalProduct } from "../externalProduct.types";

export class NoonProvider implements ExternalProductProvider {
  source = "NOON" as const;

  private noonProductService: NoonProductService;

  constructor() {
    this.noonProductService = new NoonProductService();
  }

  supports(url: string): boolean {
    try {
      const parsedUrl = new URL(url);

      return (
        parsedUrl.protocol === "https:" &&
        hostMatchesDomain(parsedUrl.hostname, "noon.com")
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
        "L'URL fournie n'est pas une URL NOON valide."
      );
    }

    return this.noonProductService.fetchProduct(url);
  }
}
