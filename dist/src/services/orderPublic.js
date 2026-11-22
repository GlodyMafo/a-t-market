"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPublicOrder = toPublicOrder;
const SNAPSHOT_PUBLIC = [
    "quoteId", "productUrl", "productName", "status", "currency", "productPrice",
    "shippingCost", "customsCost", "commissionCost", "totalPrice", "options", "expiresAt", "imageUrl",
];
function pickSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object")
        return snapshot ?? null;
    const source = snapshot;
    return Object.fromEntries(SNAPSHOT_PUBLIC.filter((key) => key in source).map((key) => [key, source[key]]));
}
/** Retire de la réponse client la marge, le prix d'achat et les paramètres internes des devis. */
function toPublicOrder(order) {
    return {
        ...order,
        items: order.items.map(({ basePrice: _basePrice, margin: _margin, quoteSnapshot, product, ...item }) => ({
            ...item,
            product: product ? (({ margin: _pm, price: _pp, ...rest }) => rest)(product) : product,
            quoteSnapshot: pickSnapshot(quoteSnapshot),
        })),
    };
}
