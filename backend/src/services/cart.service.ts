import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { activeOrderQuoteIds, quoteIssue, quoteIssueMessage } from "./quoteEligibility";
import { createQuoteFromTicket, QuoteTicketError } from "./quoteFromTicket";
import { verifyQuotePreviewTicket } from "./quotePreviewTicket";

type Tx = Prisma.TransactionClient;

interface AddToCartData {
  userId: string;
  productId: string;
  quantity: number;
}

// Vérifie qu'un produit est achetable et que la quantité totale demandée est en stock.
// C'est un contrôle de confort : le contrôle définitif a lieu à la création de la commande.
async function assertAvailable(
  product: { id: string; name: string; isActive: boolean; type: string },
  totalQuantity: number
) {
  if (!product.isActive) {
    throw new Error(`Le produit « ${product.name} » n'est plus disponible`);
  }

  if (product.type === "LOCAL") {
    const inventory = await prisma.inventory.findUnique({
      where: { productId: product.id },
      select: { quantity: true },
    });
    const available = inventory?.quantity ?? 0;

    if (totalQuantity > available) {
      throw new Error(
        available > 0
          ? `Stock insuffisant pour « ${product.name} » : ${available} disponible(s)`
          : `« ${product.name} » est en rupture de stock`
      );
    }
  }
}

export async function addToCart(data: AddToCartData) {
  const { userId, productId, quantity } = data;

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("La quantité doit être un entier supérieur à 0");
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    throw new Error("Produit introuvable");
  }

  let cart = await prisma.cart.findUnique({
    where: { userId },
  });

  if (!cart) {
    cart = await prisma.cart.create({
      data: { userId },
    });
  }

  const existingItem = await prisma.cartItem.findUnique({
    where: {
      cartId_productId: {
        cartId: cart.id,
        productId,
      },
    },
  });

  await assertAvailable(product, (existingItem?.quantity ?? 0) + quantity);

  if (existingItem) {
    return prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity: existingItem.quantity + quantity },
    });
  }

  return prisma.cartItem.create({
    data: {
      cartId: cart.id,
      productId,
      quantity,
    },
  });
}

// =============== Panier hybride : lecture ===============

const quoteFields = {
  id: true,
  status: true,
  productUrl: true,
  productName: true,
  options: true,
  currency: true,
  productPrice: true,
  productWeight: true,
  weightSource: true,
  shippingCost: true,
  customsCost: true,
  commissionCost: true,
  totalPrice: true,
  expiresAt: true,
  adminNotes: true,
  createdAt: true,
} as const;

/**
 * Panier du client : produits locaux ET devis internationaux.
 * Chaque article indique s'il est payable (`payable`) et sinon pourquoi (`issue`).
 */
export async function getCartByUser(userId: string) {
  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          product: {
            include: {
              images: true,
              inventory: { select: { quantity: true } },
            },
          },
          quote: { select: quoteFields },
        },
        orderBy: { id: "asc" },
      },
    },
  });

  if (!cart) {
    throw new Error("Panier introuvable");
  }

  const quoteIds = cart.items.flatMap((i) => (i.quote ? [i.quote.id] : []));
  const ordered = await activeOrderQuoteIds(prisma, quoteIds);

  let estimatedTotal = new Prisma.Decimal(0);

  const items = cart.items.map((item) => {
    if (item.quote) {
      const issue = quoteIssue(item.quote, ordered.has(item.quote.id));
      if (issue === null) estimatedTotal = estimatedTotal.plus(item.quote.totalPrice);
      return { ...item, kind: "INTERNATIONAL" as const, payable: issue === null, issue };
    }

    const product = item.product!;
    let issue: "UNAVAILABLE" | "OUT_OF_STOCK" | null = null;
    if (!product.isActive) issue = "UNAVAILABLE";
    else if (product.type === "LOCAL" && (product.inventory?.quantity ?? 0) < item.quantity) {
      issue = "OUT_OF_STOCK";
    }

    if (issue === null) {
      estimatedTotal = estimatedTotal.plus(
        new Prisma.Decimal(product.price).plus(product.margin).mul(item.quantity)
      );
    }
    return { ...item, kind: "LOCAL" as const, payable: issue === null, issue };
  });

  return {
    ...cart,
    items,
    /** vrai si TOUS les articles sont payables : la commande peut être créée */
    checkoutReady: items.length > 0 && items.every((i) => i.payable),
    /** total des articles payables uniquement (en USD) */
    estimatedTotal: estimatedTotal.toString(),
  };
}

// Update cart item quantity
export async function updateCartItemQuantity(
  itemId: string,
  quantity: number,
  userId: string
) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("La quantité doit être un entier supérieur à 0");
  }

  const item = await prisma.cartItem.findFirst({
    where: {
      id: itemId,
      cart: { userId },
    },
    include: { product: true },
  });

  if (!item) {
    throw new Error("Article introuvable ou accès refusé");
  }

  if (!item.product) {
    throw new Error(
      "La quantité d'un devis international ne peut pas être modifiée (1 article par devis)."
    );
  }

  await assertAvailable(item.product, quantity);

  return prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity },
  });
}

// Remove cart item
export async function removeCartItem(itemId: string, userId: string) {
  const item = await prisma.cartItem.findFirst({
    where: {
      id: itemId,
      cart: { userId },
    },
  });

  if (!item) {
    throw new Error("Article introuvable ou accès refusé");
  }

  await prisma.cartItem.delete({
    where: { id: itemId },
  });

  return {
    message: "Article supprimé du panier",
  };
}

// =============== Devis dans le panier ===============

/** Panier du client, créé si besoin, VERROUILLÉ : deux fusions simultanées passent l'une après l'autre. */
async function lockedCart(tx: Tx, userId: string) {
  const cart = await tx.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${cart.id} FOR UPDATE`;
  return cart;
}

type AttachResult =
  | { status: "ADDED" | "ALREADY_IN_CART"; itemId: string }
  | { status: "REJECTED"; reason: string };

/**
 * Met un devis (appartenant au client) dans son panier.
 * Refusé s'il est rejeté, périmé ou déjà commandé. Un devis EN ATTENTE est accepté dans le
 * panier (il sera marqué non payable) mais ne pourra pas être commandé tant qu'il n'est pas validé.
 */
async function attachQuote(
  tx: Tx,
  cartId: string,
  quote: { id: string; productName: string | null; status: string; expiresAt: Date | null; createdAt: Date }
): Promise<AttachResult> {
  const ordered = await activeOrderQuoteIds(tx, [quote.id]);
  const issue = quoteIssue(quote, ordered.has(quote.id));

  if (issue !== null && issue !== "PENDING_REVIEW") {
    return { status: "REJECTED", reason: quoteIssueMessage(issue, quote.productName) };
  }

  const existing = await tx.cartItem.findUnique({
    where: { cartId_quoteId: { cartId, quoteId: quote.id } },
  });

  if (existing) {
    return { status: "ALREADY_IN_CART", itemId: existing.id };
  }

  const created = await tx.cartItem.create({
    data: { cartId, quoteId: quote.id, quantity: 1 },
  });

  return { status: "ADDED", itemId: created.id };
}

/** Ajoute un des devis du client à son panier (1 article par devis). */
export async function addQuoteToCart(userId: string, quoteId: unknown) {
  if (typeof quoteId !== "string" || quoteId.length === 0 || quoteId.length > 100) {
    throw new Error("Devis introuvable");
  }

  return prisma.$transaction(async (tx) => {
    const quote = await tx.internationalQuote.findFirst({
      where: { id: quoteId, userId },
    });

    // Même message pour "inconnu" et "appartient à un autre client" : rien n'est révélé.
    if (!quote) {
      throw new Error("Devis introuvable");
    }

    const cart = await lockedCart(tx, userId);
    const result = await attachQuote(tx, cart.id, quote);

    if (result.status === "REJECTED") {
      throw new Error(result.reason);
    }

    return result;
  });
}

// =============== Fusion du panier invité ===============

export class MergeInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MergeInputError";
  }
}

const MAX_MERGE_ITEMS = 50;

const mergeSchema = z
  .object({
    items: z
      .array(
        z.discriminatedUnion("type", [
          z
            .object({
              type: z.literal("LOCAL"),
              productId: z.string().min(1).max(100),
              quantity: z.number().int().min(1).max(999),
            })
            .strict(),
          z
            .object({
              type: z.literal("INTERNATIONAL"),
              ticket: z.string().min(1).max(6000),
              options: z.string().max(500).optional(),
            })
            .strict(),
        ])
      )
      .max(MAX_MERGE_ITEMS),
  })
  .strict();

export type MergeItemStatus =
  | "ADDED"
  | "MERGED"
  | "ADJUSTED"
  | "ALREADY_IN_CART"
  | "REJECTED";

export interface MergeItemResult {
  index: number;
  type: "LOCAL" | "INTERNATIONAL";
  status: MergeItemStatus;
  reason?: string;
  quantity?: number;
  itemId?: string;
  quoteId?: string;
}

/**
 * Fusionne le panier invité (stocké dans le navigateur) avec le panier du compte.
 * - Produits locaux : les quantités s'ADDITIONNENT, plafonnées au stock, sans doublon.
 * - Produits internationaux : chaque ticket d'aperçu est vérifié (signature, date) puis devient
 *   un devis enregistré, SANS nouvel appel à Apify. Rejouer la même fusion ne crée rien en double.
 * Chaque article est traité séparément : un article refusé n'empêche pas les autres.
 */
export async function mergeGuestCart(userId: string, input: unknown) {
  const parsed = mergeSchema.safeParse(input);

  if (!parsed.success) {
    throw new MergeInputError(
      `Panier invité invalide : ${MAX_MERGE_ITEMS} articles maximum, chaque article de type LOCAL (productId, quantity entière 1 à 999) ou INTERNATIONAL (ticket).`
    );
  }

  const results = await prisma.$transaction(
    async (tx) => {
      const cart = await lockedCart(tx, userId);
      const out: MergeItemResult[] = [];

      for (const [index, item] of parsed.data.items.entries()) {
        if (item.type === "LOCAL") {
          out.push(await mergeLocalItem(tx, cart.id, index, item.productId, item.quantity));
        } else {
          out.push(await mergeInternationalItem(tx, cart.id, userId, index, item.ticket, item.options));
        }
      }

      return out;
    },
    { maxWait: 5000, timeout: 30000 }
  );

  return { results, cart: await getCartByUser(userId) };
}

async function mergeLocalItem(
  tx: Tx,
  cartId: string,
  index: number,
  productId: string,
  quantity: number
): Promise<MergeItemResult> {
  const base = { index, type: "LOCAL" as const };

  const product = await tx.product.findUnique({
    where: { id: productId },
    include: { inventory: { select: { quantity: true } } },
  });

  if (!product || !product.isActive) {
    return { ...base, status: "REJECTED", reason: "Produit indisponible." };
  }

  const existing = await tx.cartItem.findUnique({
    where: { cartId_productId: { cartId, productId } },
  });

  let desired = (existing?.quantity ?? 0) + quantity;
  let status: MergeItemStatus = existing ? "MERGED" : "ADDED";
  let reason: string | undefined;

  if (product.type === "LOCAL") {
    const stock = product.inventory?.quantity ?? 0;

    if (stock <= 0) {
      return {
        ...base,
        status: "REJECTED",
        reason: `« ${product.name} » est en rupture de stock.`,
        quantity: existing?.quantity,
        itemId: existing?.id,
      };
    }

    if (desired > stock) {
      desired = stock;
      status = "ADJUSTED";
      reason = `Quantité réduite au stock disponible (${stock}).`;
    }
  }

  if (existing) {
    if (desired !== existing.quantity) {
      await tx.cartItem.update({ where: { id: existing.id }, data: { quantity: desired } });
    }
    return { ...base, status, reason, quantity: desired, itemId: existing.id };
  }

  const created = await tx.cartItem.create({
    data: { cartId, productId, quantity: desired },
  });

  return { ...base, status, reason, quantity: desired, itemId: created.id };
}

async function mergeInternationalItem(
  tx: Tx,
  cartId: string,
  userId: string,
  index: number,
  rawTicket: string,
  options: string | undefined
): Promise<MergeItemResult> {
  const base = { index, type: "INTERNATIONAL" as const };

  let ticket;
  try {
    ticket = verifyQuotePreviewTicket(rawTicket);
  } catch {
    return {
      ...base,
      status: "REJECTED",
      reason: "Ticket invalide ou expiré : refaites l'aperçu du produit.",
    };
  }

  // Un ticket ne crée jamais deux devis : rejouer la fusion retrouve le devis déjà créé.
  let quote = await tx.internationalQuote.findUnique({ where: { previewId: ticket.id } });

  if (quote && quote.userId !== userId) {
    return { ...base, status: "REJECTED", reason: "Ce ticket a déjà été utilisé." };
  }

  if (!quote) {
    try {
      quote = await createQuoteFromTicket(tx, userId, ticket, options);
    } catch (error) {
      if (error instanceof QuoteTicketError) {
        return { ...base, status: "REJECTED", reason: error.message };
      }
      throw error;
    }
  }

  const result = await attachQuote(tx, cartId, quote);

  if (result.status === "REJECTED") {
    return { ...base, status: "REJECTED", reason: result.reason, quoteId: quote.id };
  }

  return { ...base, status: result.status, itemId: result.itemId, quoteId: quote.id, quantity: 1 };
}