
import { Prisma } from "../../generated/prisma/client";

type RawAttr = { name?: unknown; value?: unknown };
type RawVariant = {
  sku?: unknown;
  attributes?: unknown;
  price?: unknown;
  currency?: unknown;
  inStock?: unknown;
  stock?: unknown;
  imageUrl?: unknown;
};
type RawColor = { name?: unknown; imageUrl?: unknown };
type RawSize = { name?: unknown; available?: unknown };

const MAX_GROUPS = 6;
const MAX_VALUES = 60;
const MAX_VARIANTS = 300;
/** Au-delà de ces bornes, la table de prix ne tiendrait pas dans le ticket : on applique le prix le plus élevé. */
const MAX_TABLE_VARIANTS = 100;
const MAX_DISTINCT_PRICES = 40;

export interface PublicVariantGroup {
  name: string;
  selectsVariant: boolean;
  values: Array<{
    value: string;
    imageUrl: string | null;
    available: boolean;
  }>;
}

export interface PublicVariant {
  sku: string;
  selection: Record<string, string>;
  available: boolean;
  imageUrl: string | null;
}

const clean = (value: unknown, max = 60) =>
  typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, max)
    : "";

const httpsImage = (value: unknown) => {
  const url =
    typeof value === "string"
      ? value.trim().replace(/^http:\/\//i, "https://")
      : "";

  return /^https:\/\//i.test(url) && url.length <= 2000 ? url : null;
};

function groupLabel(name: string): string {
  if (/colou?r|couleur|颜色/i.test(name)) return "Couleur";
  if (/size|taille|尺寸|尺码/i.test(name)) return "Taille";
  if (!name || /^variants?$/i.test(name)) return "Option";
  return name;
}

interface Entry {
  sku: string;
  selection: Record<string, string>;
  sourcePrice: number | null;
  inStock: boolean;
  imageUrl: string | null;
}

export function prepareVariantPricing(input: {
  product: {
    variants?: RawVariant[];
    colors?: RawColor[];
    sizes?: RawSize[];
  };
  sourceCurrency: string;
  /** Même fonction que celle qui convertit le prix principal : USD, 2 décimales, sous forme de texte. */
  toUsd: (sourcePrice: number) => string;
  basePriceUsd: string;
}) {
  const { product, sourceCurrency, toUsd, basePriceUsd } = input;

  const entries: Entry[] = [];

  (product.variants ?? []).forEach((raw, index) => {
    if (entries.length >= MAX_VARIANTS) return;

    const attrs = Array.isArray(raw.attributes)
      ? (raw.attributes as RawAttr[])
      : [];

    const selection: Record<string, string> = {};

    for (const attr of attrs) {
      const value = clean(attr.value);
      if (!value) continue;

      const group = groupLabel(clean(attr.name, 40));

      if (selection[group] === undefined) {
        selection[group] = value;
      }
    }

    if (Object.keys(selection).length === 0) return;

    const price = Number(raw.price);

    const currency =
      typeof raw.currency === "string"
        ? raw.currency.toUpperCase()
        : sourceCurrency;

    const priced =
      Number.isFinite(price) &&
      price > 0 &&
      currency === sourceCurrency;

    entries.push({
      sku: clean(raw.sku, 100) || `v${index}`,
      selection,
      sourcePrice: priced ? price : null,
      inStock:
        raw.inStock !== false &&
        !(typeof raw.stock === "number" && raw.stock <= 0),
      imageUrl: httpsImage(raw.imageUrl),
    });
  });

  // ---- Prix par variante ----
  const live = entries.filter(
    (e) => e.inStock && e.sourcePrice !== null,
  );

  const usdOf = (e: Entry) => toUsd(e.sourcePrice as number);

  const distinct = [...new Set(live.map(usdOf))].sort(
    (a, b) => Number(a) - Number(b),
  );

  let productPrice: string | undefined;
  let variantPrices: string[] | undefined;
  let variantTable: Array<[string, number]> | undefined;
  let variantRequired = false;
  let prudent = false;

  if (distinct.length > 1) {
    if (
      live.length > MAX_TABLE_VARIANTS ||
      distinct.length > MAX_DISTINCT_PRICES
    ) {
      productPrice = distinct[distinct.length - 1];
      prudent = true;
    } else {
      productPrice = distinct[0];
      variantPrices = distinct;

      variantTable = live.map(
        (e) => [e.sku, distinct.indexOf(usdOf(e))] as [string, number],
      );

      variantRequired = true;
    }
  } else if (distinct.length === 1) {
    productPrice = distinct[0];
  }

  const tableMode = variantRequired;

  const selectable = (e: Entry) =>
    e.inStock && (!tableMode || e.sourcePrice !== null);

  // ---- Catalogue d'options (affichage) ----
  const groups = new Map<
    string,
    Map<string, { imageUrl: string | null; available: boolean }>
  >();

  const variantGroups = new Set<string>();

  const touch = (
    group: string,
    value: string,
    imageUrl: string | null,
    available: boolean,
  ) => {
    if (!groups.has(group) && groups.size >= MAX_GROUPS) return;

    const values = groups.get(group) ?? new Map();
    const current = values.get(value);

    if (!current && values.size >= MAX_VALUES) return;

    values.set(value, {
      imageUrl: current?.imageUrl ?? imageUrl,
      available: (current?.available ?? false) || available,
    });

    groups.set(group, values);
  };

  for (const e of entries) {
    for (const [group, value] of Object.entries(e.selection)) {
      touch(
        group,
        value,
        group === "Couleur" ? e.imageUrl : null,
        selectable(e),
      );

      variantGroups.add(group);
    }
  }

  // Listes de la boutique : TOUTES les couleurs et TOUTES les tailles renvoyées,
  // même si les variantes ne les décrivent pas (SHEIN renvoie ses couleurs à part).
  if (!groups.has("Couleur")) {
    for (const color of product.colors ?? []) {
      const value = clean(color.name);

      if (value) {
        touch(
          "Couleur",
          value,
          httpsImage(color.imageUrl),
          true,
        );
      }
    }
  }

  if (!groups.has("Taille")) {
    for (const size of product.sizes ?? []) {
      const value = clean(size.name);

      if (value) {
        touch(
          "Taille",
          value,
          null,
          size.available !== false,
        );
      }
    }
  }

  const order = (name: string) =>
    name === "Couleur" ? 0 : name === "Taille" ? 1 : 2;

  const publicGroups: PublicVariantGroup[] = [...groups.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([name, values]) => ({
      name,
      selectsVariant: variantGroups.has(name),
      values: [...values.entries()].map(([value, v]) => ({
        value,
        imageUrl: v.imageUrl,
        available: v.available,
      })),
    }));

  const publicVariants: PublicVariant[] = entries.map((e) => ({
    sku: e.sku,
    selection: e.selection,
    available: selectable(e),
    imageUrl: e.imageUrl,
  }));

  const maxPriceUsd =
    distinct.length > 0 ? distinct[distinct.length - 1] : null;

  return {
    ticketFields: {
      productPrice,
      variantPrices,
      variantTable,
      variantRequired: variantRequired || undefined,
    },
    variantOptions: {
      groups: publicGroups,
      variants: publicVariants,
      required: variantRequired,
    },
    /** Prix unitaire le plus élevé (USD) : sert à annoncer « jusqu'à X $ » quand les prix varient. */
    maxPriceUsd: variantRequired ? maxPriceUsd : null,
    prudent,
    basePriceUsd: new Prisma.Decimal(
      productPrice ?? basePriceUsd,
    ).toFixed(2),
  };
}
