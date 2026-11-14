const SNAPSHOT_PUBLIC = [
  "quoteId", "productUrl", "productName", "status", "currency", "productPrice",
  "shippingCost", "customsCost", "commissionCost", "totalPrice", "options", "expiresAt", "imageUrl",
] as const;

function pickSnapshot(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object") return snapshot ?? null;
  const source = snapshot as Record<string, unknown>;
  return Object.fromEntries(SNAPSHOT_PUBLIC.filter((key) => key in source).map((key) => [key, source[key]]));
}

/** Retire de la réponse client la marge, le prix d'achat et les paramètres internes des devis. */
export function toPublicOrder<T extends { items: Array<Record<string, any>> }>(order: T): T {
  return {
    ...order,
    items: order.items.map(({ basePrice: _basePrice, margin: _margin, quoteSnapshot, product, ...item }) => ({
      ...item,
      product: product ? (({ margin: _pm, price: _pp, ...rest }: Record<string, any>) => rest)(product) : product,
      quoteSnapshot: pickSnapshot(quoteSnapshot),
    })),
  };
}