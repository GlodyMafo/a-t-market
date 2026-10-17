import {
  NormalizedExternalProduct,
} from "./externalProduct.types";

import {
  ExternalProductProvider,
} from "./externalProduct.provider";

import { SheinProvider } from "./providers/shein.provider";
import { parseSupportedProductUrl } from "./productUrl";

export class ExternalProductService {

  private providers: ExternalProductProvider[];

  constructor() {

    this.providers = [
      new SheinProvider(),
    ];

  }

  async fetchProduct(
    url: string
  ): Promise<NormalizedExternalProduct> {

    // Validation stricte AVANT tout appel à un fournisseur (et donc à Apify, payant).
    const parsedUrl = parseSupportedProductUrl(url);
    url = parsedUrl.href;

    const provider =
      this.providers.find(
        (provider) =>
          provider.supports(url)
      );

    if (!provider) {
      throw new Error(
        "Aucun fournisseur ne prend en charge cette URL."
      );
    }

    console.log(
      `[External Product] Provider sélectionné : ${provider.source}`
    );

    return provider.fetchProduct(url);
  }

}