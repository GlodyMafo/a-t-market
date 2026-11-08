type RawColor = { name?: unknown; imageUrl?: unknown };
type RawSize = { name?: unknown; available?: unknown };
type RawVariant = { price?: unknown; currency?: unknown; inStock?: unknown };

const MAX_OPTIONS = 40;

const cleanName = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 60) : "";

/**
 * Prix retenu pour le devis : le plus élevé entre le prix principal et celui des variantes en stock
 * (même devise). Ainsi la vente ne passe jamais sous le coût réel, quelle que soit la variante choisie.
 * Les valeurs aberrantes (plus de 5 fois le prix principal) sont ignorées.
 */
export function highestVariantPrice(variants: RawVariant[] | undefined, currency: string, basePrice: number): number {
  let highest = basePrice;
  for (const variant of variants ?? []) {
    const price = Number(variant.price);
    if (!Number.isFinite(price) || price <= 0 || price > basePrice * 5) continue;
    if (variant.inStock === false) continue;
    if (typeof variant.currency === "string" && variant.currency.toUpperCase() !== currency) continue;
    if (price > highest) highest = price;
  }
  return highest;
}

/** Options affichables par le client : noms nettoyés, sans doublon, photos en https uniquement. */
export function buildVariantOptions(
  product: { colors?: RawColor[]; sizes?: RawSize[] },
  priceVariesByVariant: boolean
) {
  const colors: Array<{ name: string; imageUrl: string | null }> = [];
  const seenColors = new Set<string>();
  for (const color of product.colors ?? []) {
    const name = cleanName(color.name);
    const key = name.toLowerCase();
    if (!name || seenColors.has(key)) continue;
    seenColors.add(key);
    const image = typeof color.imageUrl === "string" ? color.imageUrl.trim().replace(/^\/\//, "https://") : "";
    colors.push({ name, imageUrl: /^https:\/\//i.test(image) && image.length <= 2000 ? image : null });
    if (colors.length >= MAX_OPTIONS) break;
  }

  const sizes: Array<{ name: string; available: boolean }> = [];
  const seenSizes = new Set<string>();
  for (const size of product.sizes ?? []) {
    const name = cleanName(size.name);
    const key = name.toLowerCase();
    if (!name || seenSizes.has(key)) continue;
    seenSizes.add(key);
    sizes.push({ name, available: size.available !== false });
    if (sizes.length >= MAX_OPTIONS) break;
  }

  return { colors, sizes, priceVariesByVariant };
}