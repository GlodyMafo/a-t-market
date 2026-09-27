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
*
* Exemple :
*
* {
* name: "M",
* available: true
* }
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
* CONVERSIONS DE TAILLES
* =====================================================
*
* Exemple :
*
* M
* ├── FR : 38
* ├── EU : 38
* ├── US : 6
* └── UK : 10
  */

export interface ExternalProductSizeConversion {
size: string;

conversions: Record<
string,
string

> ;
 }

/*

* =====================================================
* MESURES D'UNE TAILLE
* =====================================================
*
* Exemple :
*
* {
* size: "M",
* cm: {
* ```
  Bust: "112",
  ```
* ```
  Length: "59"
  ```
* },
* inch: {
* ```
  Bust: "44.1",
  ```
* ```
  Length: "23.2"
  ```
* }
* }
  */

export interface ExternalProductSizeMeasurement {
size: string;

cm?: Record<
string,
string

> ;

inch?: Record<
string,
string

> ;
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
*
* Exemple :
*
* {
* name: "Material",
* value: "Knitwear"
* }
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
* Le prix et la devise appartiennent au produit
* normalisé final.
*
* Pour SHEIN, ces valeurs viendront de Native Emblem.
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

sizeConversions?: ExternalProductSizeConversion[];

sizeChart?: ExternalProductSizeChart;

/*

* COULEURS
  */

colors: ExternalProductColor[];

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
