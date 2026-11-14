"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProductDetails = buildProductDetails;
exports.stockLimitOf = stockLimitOf;
const clean = (value, max) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
/** Caractéristiques affichables : textes nettoyés et bornés ; les « Caractéristique N » deviennent des points forts. */
function buildProductDetails(product) {
    const specs = [];
    const highlights = [];
    const seen = new Set();
    for (const attr of Array.isArray(product.attributes) ? product.attributes : []) {
        const name = clean(attr.name, 60);
        const value = clean(attr.value, 240);
        if (!name || !value)
            continue;
        if (/^caract[ée]ristique\s*\d+$/i.test(name)) {
            if (highlights.length < 8)
                highlights.push(value);
            continue;
        }
        const key = `${name.toLowerCase()}|${value.toLowerCase()}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        if (specs.length < 30)
            specs.push({ name, value });
    }
    return { specs, highlights };
}
/** Stock du vendeur, uniquement quand la boutique le fournit (NOON). */
function stockLimitOf(product) {
    if (product.source !== "NOON")
        return null;
    const stock = product.raw?.stock;
    return typeof stock === "number" && Number.isInteger(stock) && stock > 0 && stock < 1_000_000 ? stock : null;
}
