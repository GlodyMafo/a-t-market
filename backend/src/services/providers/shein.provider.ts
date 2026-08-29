import {
  ExternalProductProvider,
} from "../externalProduct.service";

import {
  NormalizedExternalProduct,
} from "../externalProduct.types";

export class SheinProvider
  implements ExternalProductProvider {

  source = "SHEIN" as const;

  supports(url: string): boolean {

    try {

      const hostname =
        new URL(url).hostname.toLowerCase();

      return (
        hostname.includes("shein.com")
      );

    } catch {

      return false;

    }

  }

  async fetchProduct(
    url: string
  ): Promise<NormalizedExternalProduct> {

    /*
     * L'appel à l'API externe sera branché ici.
     *
     * IMPORTANT :
     * On ne scrape pas SHEIN.
     * On ne lance pas Playwright.
     * On ne crée pas nous-mêmes les tailles.
     */

    throw new Error(
      "Provider SHEIN : API externe non configurée"
    );

  }

}