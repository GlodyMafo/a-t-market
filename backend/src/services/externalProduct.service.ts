
import {
  NormalizedExternalProduct,
} from "./externalProduct.types";

import {
  ExternalProductProvider,
} from "./externalProduct.provider";

import { SheinProvider } from "./providers/shein.provider";
import { NoonProvider } from "./providers/noon.provider";

import { parseSupportedProductUrl } from "./productUrl";
import {
  inspectProductUrl,
  resolveProductUrl,
  ProductMarketplace,
} from "./productUrlResolver";

export class ExternalProductService {
  private providers: ExternalProductProvider[];

  constructor() {
  this.providers = [
    new SheinProvider(),
    new NoonProvider(),
  ];
}

  /**
   * Vérifie si un provider existe pour une marketplace.
   * Cette vérification ne déclenche aucune extraction.
   */
  supportsMarketplace(marketplace: ProductMarketplace): boolean {
    return this.providers.some(
      (provider) => provider.source === marketplace
    );
  }

  /**
   * Extraction destinée aux appels directs de l'API.
   * Les liens courts sont résolus ici si nécessaire.
   */
  async fetchProduct(url: string): Promise<NormalizedExternalProduct> {
    const inspected = inspectProductUrl(url);

    if (!this.supportsMarketplace(inspected.marketplace)) {
      throw new Error(
        `Aucun fournisseur n'est encore disponible pour ${inspected.marketplace}.`
      );
    }

    let canonicalUrl = inspected.url.href;

    if (inspected.isShortLink) {
      const resolved = await resolveProductUrl(url);
      canonicalUrl = resolved.canonicalUrl;
    }

    return this.fetchCanonicalProduct(canonicalUrl);
  }

  /**
   * Extraction d'une URL déjà résolue et validée.
   * Cette méthode ne relance jamais le résolveur.
   */
  async fetchCanonicalProduct(
    url: string
  ): Promise<NormalizedExternalProduct> {
    const parsedUrl = parseSupportedProductUrl(url);
    const canonicalUrl = parsedUrl.href;

    const provider = this.providers.find((item) =>
      item.supports(canonicalUrl)
    );

    if (!provider) {
      throw new Error(
        "Aucun fournisseur n'est disponible pour ce produit."
      );
    }

    console.log(
      `[External Product] Provider sélectionné : ${provider.source}`
    );

    return provider.fetchProduct(canonicalUrl);
  }
}
