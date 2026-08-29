export type ExternalProductSource =
  | "SHEIN"
  | "AMAZON"
  | "ALIBABA"
  | "PINDUODUO";

export interface ExternalProductSize {
  name: string;
  available: boolean;
}

export interface ExternalProductColor {
  name: string;
  imageUrl?: string;
}

export interface NormalizedExternalProduct {
  source: ExternalProductSource;

  externalId?: string;

  url: string;

  name: string;

  description?: string;

  price: number;

  currency: string;

  images: string[];

  sizes: ExternalProductSize[];

  colors: ExternalProductColor[];

  inStock: boolean;

  weightKg?: number;

  rating?: number;

  reviewsCount?: number;

  raw?: unknown;
}