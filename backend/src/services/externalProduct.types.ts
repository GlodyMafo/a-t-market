/*
 * =====================================================
 * SOURCES DE PRODUITS EXTERNES
 * =====================================================
 */

export type ExternalProductSource =
  | "SHEIN"
  | "AMAZON"
  | "ALIBABA"
  | "PINDUODUO";

/*
 * =====================================================
 * TAILLES
 * =====================================================
 */

export interface ExternalProductSize {
  name: string;
  available: boolean;
}

/*
 * =====================================================
 * COULEURS
 * =====================================================
 */

export interface ExternalProductColor {
  name: string;
  imageUrl?: string;
}

/*
 * =====================================================
 * DÉTAIL D'UNE TAILLE
 * =====================================================
 *
 * Données provenant notamment d'Omkar :
 *
 * - taille
 * - SKU
 * - stock
 * - disponibilité
 * - prix
 */

export interface ExternalProductSizeDetail {
  size: string;
  sku?: string;
  stock?: number;
  inStock: boolean;
  price?: number;
  currency?: string;
}

/*
 * =====================================================
 * VARIANTES
 * =====================================================
 *
 * Exemple :
 *
 * Taille M
 * └── SKU
 * └── Stock
 *
 * Une variante peut également contenir
 * plusieurs attributs.
 */

export interface ExternalProductVariantAttribute {
  name: string;
  value: string;
}

export interface ExternalProductVariant {
  sku: string;

  attributes: ExternalProductVariantAttribute[];

  price?: number;

  currency?: string;

  stock?: number;

  inStock: boolean;

  quickShip?: boolean;
}

/*
 * =====================================================
 * CONVERSIONS DE TAILLES
 * =====================================================
 */

export interface ExternalProductSizeConversion {
  size: string;

  conversions: Record<string, string>;
}

/*
 * =====================================================
 * MESURES D'UNE TAILLE
 * =====================================================
 */

export interface ExternalProductSizeMeasurement {
  size: string;

  cm?: Record<string, string>;

  inch?: Record<string, string>;
}

/*
 * =====================================================
 * PARTIE DU SIZE CHART
 * =====================================================
 */

export interface ExternalProductSizeChartPart {
  part: string | null;

  measurements: string[];

  sizes: ExternalProductSizeMeasurement[];
}

/*
 * =====================================================
 * SIZE CHART
 * =====================================================
 */

export interface ExternalProductSizeChart {
  parts: ExternalProductSizeChartPart[];

  guideImage?: string;
}

/*
 * =====================================================
 * SIZE GUIDE OMKAR
 * =====================================================
 *
 * Exemple :
 *
 * Size M
 * ├── Bust: 82 cm
 * └── Length: 34 cm
 */

export interface ExternalProductSizeGuideMeasurement {
  size: string;

  measurements: Record<string, string>;
}

export interface ExternalProductSizeGuide {
  url?: string;

  measurements: ExternalProductSizeGuideMeasurement[];
}

/*
 * =====================================================
 * FIT / RECOMMANDATIONS
 * =====================================================
 */

export interface ExternalProductFitReviewer {
  height_cm?: string;

  weight_kg?: string;

  bust_cm?: string;

  waist_cm?: string;

  hips_cm?: string;
}

export interface ExternalProductSizeRecommendation {
  size: string;

  reviewers: ExternalProductFitReviewer[];
}

export interface ExternalProductFit {
  overall?: {
    true_size?: string;

    large?: string;

    small?: string;
  };

  sizeRecommendations: ExternalProductSizeRecommendation[];
}

/*
 * =====================================================
 * ATTRIBUTS
 * =====================================================
 */

export interface ExternalProductAttribute {
  name: string;

  value: string;
}

/*
 * =====================================================
 * PRODUIT NORMALISÉ
 * =====================================================
 *
 * C'est le contrat principal utilisé par A&T Market.
 *
 * IMPORTANT :
 *
 * Pour SHEIN :
 *
 * Native Emblem = source de vérité pour :
 * - prix
 * - devise
 * - goodsId
 * - informations principales
 *
 * Omkar = enrichissement :
 * - couleurs
 * - tailles
 * - variantes
 * - SKU
 * - stock
 * - size guide
 */

export interface NormalizedExternalProduct {
  /*
   * Fournisseur
   */

  source: ExternalProductSource;

  /*
   * Identifiant du produit chez le fournisseur
   */

  externalId?: string;

  /*
   * URL du produit
   */

  url: string;

  /*
   * Informations principales
   */

  name: string;

  description?: string;

  category?: string;

  /*
   * PRIX
   *
   * Pour SHEIN :
   * Native Emblem → prix
   */

  price: number;

  currency: string;

  /*
   * IMAGES
   */

  images: string[];

  /*
   * TAILLES
   */

  sizes: ExternalProductSize[];

  sizeDetails?: ExternalProductSizeDetail[];

  sizeConversions?: ExternalProductSizeConversion[];

  sizeChart?: ExternalProductSizeChart;

  sizeGuide?: ExternalProductSizeGuide;

  /*
   * COULEURS
   */

  colors: ExternalProductColor[];

  /*
   * VARIANTES
   */

  variants?: ExternalProductVariant[];

  /*
   * FIT
   */

  fit?: ExternalProductFit;

  /*
   * ATTRIBUTS
   */

  attributes?: ExternalProductAttribute[];

  /*
   * DISPONIBILITÉ
   */

  inStock: boolean;

  /*
   * INFORMATIONS OPTIONNELLES
   */

  weightKg?: number;

  rating?: number;

  reviewsCount?: number;

  /*
   * DONNÉES BRUTES
   *
   * Utile pour conserver les données originales
   * retournées par les Actors.
   */

  raw?: unknown;
}