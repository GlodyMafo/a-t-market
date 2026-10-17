import { Prisma } from "../../generated/prisma/client";

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/** Plafonds de bon sens : au-delà, la donnée est considérée comme aberrante. */
const MAX_PRODUCT_PRICE = 100_000;
const MAX_WEIGHT_KG = 1_000;

export interface PricingSettings {
  commissionRate: Decimal | number | string; // en pourcentage (15 = 15 %)
  chinaPricePerKg: Decimal | number | string; // USD par kg, douane incluse
  fixedFee: Decimal | number | string; // USD
}

export interface QuoteBreakdown {
  productPrice: Decimal;
  shippingCost: Decimal;
  customsCost: Decimal;
  commissionCost: Decimal;
  fixedFee: Decimal;
  totalPrice: Decimal;
  /** true si le poids est inconnu : le transport vaut 0 par défaut, ce n'est PAS un prix final. */
  isProvisional: boolean;
}

// Arrondi commercial (0,5 centime arrondi vers le haut), appliqué à CHAQUE composante.
const round2 = (value: Decimal) =>
  value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/**
 * Calcule le prix total livré d'un produit international.
 *
 *   total = prix produit + transport + commission + frais fixes
 *   transport  = poids (kg) x tarif par kg     (la douane est incluse dedans)
 *   commission = prix produit x taux
 *
 * Chaque composante est arrondie au centime, et le total est la somme des
 * composantes arrondies : le détail affiché au client tombe toujours juste.
 * Calcul en décimal exact (jamais de flottants).
 *
 * Un poids inconnu (null) ne vaut JAMAIS 0 kg : le résultat est marqué provisoire.
 */
export function computeQuote(input: {
  productPrice: number | string | Decimal;
  weightKg: number | string | Decimal | null;
  settings: PricingSettings;
}): QuoteBreakdown {
  const price = new Decimal(input.productPrice);

  if (!price.isFinite() || price.lte(0) || price.gt(MAX_PRODUCT_PRICE)) {
    throw new Error("Le prix du produit doit être valide.");
  }

  let weight: Decimal | null = null;
  if (input.weightKg !== null && input.weightKg !== undefined) {
    weight = new Decimal(input.weightKg);
    if (!weight.isFinite() || weight.lte(0) || weight.gt(MAX_WEIGHT_KG)) {
      throw new Error("Le poids du produit doit être valide.");
    }
  }

  const commissionRate = new Decimal(input.settings.commissionRate);
  const pricePerKg = new Decimal(input.settings.chinaPricePerKg);
  const fixedFee = round2(new Decimal(input.settings.fixedFee));

  const productPrice = round2(price);
  const shippingCost = weight ? round2(weight.mul(pricePerKg)) : new Decimal(0);
  const commissionCost = round2(productPrice.mul(commissionRate).div(100));
  const customsCost = new Decimal(0); // déjà incluse dans le transport

  const totalPrice = productPrice
    .plus(shippingCost)
    .plus(commissionCost)
    .plus(customsCost)
    .plus(fixedFee);

  return {
    productPrice,
    shippingCost,
    customsCost,
    commissionCost,
    fixedFee,
    totalPrice,
    isProvisional: weight === null,
  };
}