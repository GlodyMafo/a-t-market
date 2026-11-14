"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareVariantPricing = prepareVariantPricing;
const client_1 = require("../../generated/prisma/client");
const MAX_GROUPS = 6;
const MAX_VALUES = 60;
const MAX_VARIANTS = 300;
/** Au-delà de ces bornes, la table de prix ne tiendrait pas dans le ticket : on applique le prix le plus élevé. */
const MAX_TABLE_VARIANTS = 100;
const MAX_DISTINCT_PRICES = 40;
const clean = (value, max = 60) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
const httpsImage = (value) => {
    const url = typeof value === "string" ? value.trim().replace(/^\/\//, "https://") : "";
    return /^https:\/\//i.test(url) && url.length <= 2000 ? url : null;
};
function groupLabel(name) {
    if (/colou?r|couleur|颜色/i.test(name))
        return "Couleur";
    if (/size|taille|尺寸|尺码/i.test(name))
        return "Taille";
    if (!name || /^variants?$/i.test(name))
        return "Option";
    return name;
}
function prepareVariantPricing(input) {
    const { product, sourceCurrency, toUsd, basePriceUsd } = input;
    const entries = [];
    (product.variants ?? []).forEach((raw, index) => {
        if (entries.length >= MAX_VARIANTS)
            return;
        const attrs = Array.isArray(raw.attributes) ? raw.attributes : [];
        const selection = {};
        for (const attr of attrs) {
            const value = clean(attr.value);
            if (!value)
                continue;
            const group = groupLabel(clean(attr.name, 40));
            if (selection[group] === undefined)
                selection[group] = value;
        }
        if (Object.keys(selection).length === 0)
            return; // variante sans option lisible : inutilisable
        const price = Number(raw.price);
        const currency = typeof raw.currency === "string" ? raw.currency.toUpperCase() : sourceCurrency;
        const priced = Number.isFinite(price) && price > 0 && currency === sourceCurrency;
        entries.push({
            sku: clean(raw.sku, 100) || `v${index}`,
            selection,
            sourcePrice: priced ? price : null,
            inStock: raw.inStock !== false && !(typeof raw.stock === "number" && raw.stock <= 0),
            imageUrl: httpsImage(raw.imageUrl),
        });
    });
    // ---- Prix par variante ----
    const live = entries.filter((e) => e.inStock && e.sourcePrice !== null);
    const usdOf = (e) => toUsd(e.sourcePrice);
    const distinct = [...new Set(live.map(usdOf))].sort((a, b) => Number(a) - Number(b));
    let productPrice;
    let variantPrices;
    let variantTable;
    let variantRequired = false;
    let prudent = false;
    if (distinct.length > 1) {
        if (live.length > MAX_TABLE_VARIANTS || distinct.length > MAX_DISTINCT_PRICES) {
            productPrice = distinct[distinct.length - 1]; // trop de variantes pour le ticket : prix le plus élevé
            prudent = true;
        }
        else {
            productPrice = distinct[0]; // prix de départ affiché : la variante la moins chère
            variantPrices = distinct;
            variantTable = live.map((e) => [e.sku, distinct.indexOf(usdOf(e))]);
            variantRequired = true;
        }
    }
    else if (distinct.length === 1) {
        productPrice = distinct[0];
    }
    const tableMode = variantRequired;
    const selectable = (e) => e.inStock && (!tableMode || e.sourcePrice !== null);
    // ---- Catalogue d'options (affichage) ----
    const groups = new Map();
    const touch = (group, value, imageUrl, available) => {
        if (!groups.has(group) && groups.size >= MAX_GROUPS)
            return;
        const values = groups.get(group) ?? new Map();
        const current = values.get(value);
        if (!current && values.size >= MAX_VALUES)
            return;
        values.set(value, { imageUrl: current?.imageUrl ?? imageUrl, available: (current?.available ?? false) || available });
        groups.set(group, values);
    };
    if (entries.length > 0) {
        for (const e of entries) {
            for (const [group, value] of Object.entries(e.selection)) {
                touch(group, value, group === "Couleur" ? e.imageUrl : null, selectable(e));
            }
        }
    }
    else {
        // Repli : pas de variantes exploitables. Listes simples, sans prix par variante.
        for (const color of product.colors ?? []) {
            const value = clean(color.name);
            if (value)
                touch("Couleur", value, httpsImage(color.imageUrl), true);
        }
        for (const size of product.sizes ?? []) {
            const value = clean(size.name);
            if (value)
                touch("Taille", value, null, size.available !== false);
        }
    }
    const order = (name) => (name === "Couleur" ? 0 : name === "Taille" ? 1 : 2);
    const publicGroups = [...groups.entries()]
        .sort((a, b) => order(a[0]) - order(b[0]))
        .map(([name, values]) => ({
        name,
        values: [...values.entries()].map(([value, v]) => ({ value, imageUrl: v.imageUrl, available: v.available })),
    }));
    const publicVariants = entries.map((e) => ({
        sku: e.sku, selection: e.selection, available: selectable(e), imageUrl: e.imageUrl,
    }));
    const maxPriceUsd = distinct.length > 0 ? distinct[distinct.length - 1] : null;
    return {
        ticketFields: { productPrice, variantPrices, variantTable, variantRequired: variantRequired || undefined },
        variantOptions: { groups: publicGroups, variants: publicVariants, required: variantRequired },
        /** Prix unitaire le plus élevé (USD) : sert à annoncer « jusqu'à X $ » quand les prix varient. */
        maxPriceUsd: variantRequired ? maxPriceUsd : null,
        prudent,
        basePriceUsd: new client_1.Prisma.Decimal(productPrice ?? basePriceUsd).toFixed(2),
    };
}
