type RawAttr = { name?: unknown; value?: unknown };

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Caractéristiques affichables : textes nettoyés et bornés ; les « Caractéristique N » deviennent des points forts. */
export function buildProductDetails(product: { attributes?: unknown }) {
  const specs: Array<{ name: string; value: string }> = [];
  const highlights: string[] = [];
  const seen = new Set<string>();

  for (const attr of Array.isArray(product.attributes) ? (product.attributes as RawAttr[]) : []) {
    const name = clean(attr.name, 60);
    const value = clean(attr.value, 240);
    if (!name || !value) continue;

    if (/^caract[ée]ristique\s*\d+$/i.test(name)) {
      if (highlights.length < 8) highlights.push(value);
      continue;
    }
    const key = `${name.toLowerCase()}|${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (specs.length < 30) specs.push({ name, value });
  }
  return { specs, highlights };
}

/** Stock du vendeur, uniquement quand la boutique le fournit (NOON). */
export function stockLimitOf(product: { source?: unknown; raw?: unknown }): number | null {
  if (product.source !== "NOON") return null;
  const stock = (product.raw as { stock?: unknown } | undefined)?.stock;
  return typeof stock === "number" && Number.isInteger(stock) && stock > 0 && stock < 1_000_000 ? stock : null;
}