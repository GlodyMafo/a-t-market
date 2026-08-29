import {
  ExternalProductSource,
  NormalizedExternalProduct,
} from "./externalProduct.types";

export interface ExternalProductProvider {
  source: ExternalProductSource;

  supports(url: string): boolean;

  fetchProduct(
    url: string
  ): Promise<NormalizedExternalProduct>;
}