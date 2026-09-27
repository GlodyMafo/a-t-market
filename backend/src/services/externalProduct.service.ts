import {
  NormalizedExternalProduct,
} from "./externalProduct.types";

import {
  ExternalProductProvider,
} from "./externalProduct.provider";

import { SheinProvider } from "./providers/shein.provider";

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

    if (!url) {
      throw new Error(
        "L'URL du produit est obligatoire."
      );
    }

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