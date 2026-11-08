
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import {
  activeOrderQuoteIds,
  quoteIssue,
  quoteIssueMessage,
} from "./quoteEligibility";
import {
  createQuoteFromTicket,
  QuoteTicketError,
} from "./quoteFromTicket";
import { verifyQuotePreviewTicket } from "./quotePreviewTicket";
import {
  categoryChainSelect,
  isCategoryActive,
  type CategoryChain,
} from "./productAvailability";
import { detectProductMarketplace } from "./productUrl";
import { computeQuote } from "./pricing.service";

type Tx = Prisma.TransactionClient;

interface AddToCartData {
  userId: string;
  productId: string;
  quantity: number;
}

// Vérifie qu'un produit est achetable et que la quantité totale demandée est en stock.
// C'est un contrôle de confort : le contrôle définitif a lieu à la création de la commande.
async function assertAvailable(
  product: {
    id: string;
    name: string;
    isActive: boolean;
    type: string;
    subCategory?: CategoryChain;
  },
  totalQuantity: number
) {
  if (!product.isActive || !isCategoryActive(product.subCategory)) {
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
    include: { subCategory: categoryChainSelect },
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

  await assertAvailable(
    product,
    (existingItem?.quantity ?? 0) + quantity
  );

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
  minOrderQuantity: true,
  weightSource: true,
  shippingCost: true,
  customsCost: true,
  commissionCost: true,
  commissionRate: true,
  chinaPricePerKg: true,
  fixedFee: true,
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
              subCategory: categoryChainSelect,
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

  const quoteIds = cart.items.flatMap((item) =>
    item.quote ? [item.quote.id] : []
  );

  const ordered = await activeOrderQuoteIds(prisma, quoteIds);

  let estimatedTotal = new Prisma.Decimal(0);

  const items = cart.items.map((item) => {
    if (item.quote) {
      const quote = item.quote;

      const baseIssue = quoteIssue(
        quote,
        ordered.has(quote.id)
      );

      const is1688 =
        detectProductMarketplace(quote.productUrl) === "1688";

      const minOrderQuantity = quote.minOrderQuantity;

      const belowMinimum =
        is1688 &&
        minOrderQuantity !== null &&
        item.quantity < minOrderQuantity;

      let cartPricing: ReturnType<typeof computeQuote> | null = null;
      let pricingIssue: string | null = null;

      if (is1688) {
        // Aucun tarif fictif : les paramètres absents rendent le devis non payable.
        if (
          quote.commissionRate === null ||
          quote.chinaPricePerKg === null ||
          quote.fixedFee === null
        ) {
          pricingIssue = "PRICING_SETTINGS_MISSING";
        } else {
          try {
            // Le prix et le poids sont unitaires dans le devis.
            // Le transport et la commission sont recalculés sur la quantité totale.
            // Les frais fixes ne sont appliqués qu'une seule fois.
            cartPricing = computeQuote({
              productPrice: new Prisma.Decimal(quote.productPrice).mul(
                item.quantity
              ),
              weightKg:
                quote.productWeight === null
                  ? null
                  : new Prisma.Decimal(quote.productWeight).mul(
                      item.quantity
                    ),
              settings: {
                commissionRate: quote.commissionRate,
                chinaPricePerKg: quote.chinaPricePerKg,
                fixedFee: quote.fixedFee,
              },
            });
          } catch {
            pricingIssue = "PRICING_LIMIT_EXCEEDED";
          }
        }
      }

      const issue =
        baseIssue ??
        (belowMinimum ? "BELOW_MINIMUM_ORDER" : null) ??
        pricingIssue;

      if (issue === null) {
        estimatedTotal = estimatedTotal.plus(
          is1688 && cartPricing
            ? cartPricing.totalPrice
            : quote.totalPrice
        );
      }

      // Les paramètres internes restent disponibles pour le calcul,
      // mais ne sont pas exposés dans la réponse publique du panier.
      const {
        commissionRate: _commissionRate,
        chinaPricePerKg: _chinaPricePerKg,
        adminNotes: _adminNotes,
        ...publicQuote
      } = quote;

      return {
        ...item,
        quote: publicQuote,
        kind: "INTERNATIONAL" as const,
        payable: issue === null,
        issue,
        minOrderQuantity,
        minimumOrderMessage: belowMinimum
          ? `Quantité minimale requise pour ce produit 1688 : ${minOrderQuantity}.`
          : null,
        cartPricing: cartPricing
          ? {
              productPrice: cartPricing.productPrice.toString(),
              shippingCost: cartPricing.shippingCost.toString(),
              customsCost: cartPricing.customsCost.toString(),
              commissionCost: cartPricing.commissionCost.toString(),
              fixedFee: cartPricing.fixedFee.toString(),
              totalPrice: cartPricing.totalPrice.toString(),
              isProvisional: cartPricing.isProvisional,
            }
          : null,
      };
    }

    const product = item.product!;

    let issue: "UNAVAILABLE" | "OUT_OF_STOCK" | null = null;

    if (
      !product.isActive ||
      !isCategoryActive(product.subCategory)
    ) {
      issue = "UNAVAILABLE";
    } else if (
      product.type === "LOCAL" &&
      (product.inventory?.quantity ?? 0) < item.quantity
    ) {
      issue = "OUT_OF_STOCK";
    }

    if (issue === null) {
      estimatedTotal = estimatedTotal.plus(
        new Prisma.Decimal(product.price)
          .plus(product.margin)
          .mul(item.quantity)
      );
    }

    return {
      ...item,
      kind: "LOCAL" as const,
      payable: issue === null,
      issue,
    };
  });

  return {
    ...cart,
    items,
    /** Vrai si tous les articles sont payables. */
    checkoutReady:
      items.length > 0 && items.every((item) => item.payable),
    /** Total des articles payables uniquement (en USD). */
    estimatedTotal: estimatedTotal.toString(),
  };
}

// =============== Modification de quantité ===============

export async function updateCartItemQuantity(
  itemId: string,
  quantity: number,
  userId: string
) {
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 999
  ) {
    throw new Error(
      "La quantité doit être un entier compris entre 1 et 999."
    );
  }

  const item = await prisma.cartItem.findFirst({
    where: {
      id: itemId,
      cart: { userId },
    },
    include: {
      product: {
        include: { subCategory: categoryChainSelect },
      },
      quote: {
        select: {
          productUrl: true,
        },
      },
    },
  });

  if (!item) {
    throw new Error("Article introuvable ou accès refusé");
  }

  if (!item.product) {
    if (!item.quote) {
      throw new Error("Devis international introuvable.");
    }

    const marketplace = detectProductMarketplace(
      item.quote.productUrl
    );

    if (marketplace !== "1688") {
      throw new Error(
        "La quantité des devis SHEIN et NOON ne peut pas être modifiée."
      );
    }

    return prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });
  }

  await assertAvailable(item.product, quantity);

  return prisma.cartItem.update({
    where: { id: itemId },
    data: { quantity },
  });
}

// =============== Suppression du panier ===============

export async function removeCartItem(
  itemId: string,
  userId: string
) {
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

/**
 * Panier du client, créé si besoin et verrouillé :
 * deux fusions simultanées passent l'une après l'autre.
 */
async function lockedCart(tx: Tx, userId: string) {
  const cart = await tx.cart.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  await tx.$queryRaw`
    SELECT id FROM "Cart" WHERE id = ${cart.id} FOR UPDATE
  `;

  return cart;
}

type AttachResult =
  | {
      status: "ADDED" | "ALREADY_IN_CART";
      itemId: string;
    }
  | {
      status: "REJECTED";
      reason: string;
    };

/**
 * Ajoute un devis appartenant au client dans son panier.
 * Un devis EN ATTENTE peut être ajouté, mais reste non payable.
 */
async function attachQuote(
  tx: Tx,
  cartId: string,
  quote: {
    id: string;
    productName: string | null;
    productUrl: string;
    status: string;
    expiresAt: Date | null;
    createdAt: Date;
  },
  quantity = 1
): Promise<AttachResult> {
  const marketplace = detectProductMarketplace(
    quote.productUrl
  );

  if (marketplace !== "1688" && quantity !== 1) {
    return {
      status: "REJECTED",
      reason:
        "La quantité des devis SHEIN et NOON est limitée à 1.",
    };
  }

  const ordered = await activeOrderQuoteIds(tx, [quote.id]);

  const issue = quoteIssue(
    quote,
    ordered.has(quote.id)
  );

  if (issue !== null && issue !== "PENDING_REVIEW") {
    return {
      status: "REJECTED",
      reason: quoteIssueMessage(issue, quote.productName),
    };
  }

  const existing = await tx.cartItem.findUnique({
    where: {
      cartId_quoteId: {
        cartId,
        quoteId: quote.id,
      },
    },
  });

  if (existing) {
    return {
      status: "ALREADY_IN_CART",
      itemId: existing.id,
    };
  }

  const created = await tx.cartItem.create({
    data: {
      cartId,
      quoteId: quote.id,
      quantity,
    },
  });

  return {
    status: "ADDED",
    itemId: created.id,
  };
}

/** Ajoute un devis du client au panier. */
export async function addQuoteToCart(
  userId: string,
  quoteId: unknown,
  requestedQuantity: unknown = 1
) {
  if (
    typeof quoteId !== "string" ||
    quoteId.length === 0 ||
    quoteId.length > 100
  ) {
    throw new Error("Devis introuvable");
  }

  if (
    typeof requestedQuantity !== "number" ||
    !Number.isInteger(requestedQuantity) ||
    requestedQuantity < 1 ||
    requestedQuantity > 999
  ) {
    throw new Error(
      "La quantité doit être un entier compris entre 1 et 999."
    );
  }

  return prisma.$transaction(async (tx) => {
    const quote = await tx.internationalQuote.findFirst({
      where: {
        id: quoteId,
        userId,
      },
    });

    // Même message pour un devis inconnu ou appartenant à un autre client.
    if (!quote) {
      throw new Error("Devis introuvable");
    }

    const cart = await lockedCart(tx, userId);

    const result = await attachQuote(
      tx,
      cart.id,
      quote,
      requestedQuantity
    );

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
              quantity: z.number().int().min(1).max(999).default(1),
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
 * Fusionne le panier invité avec le panier du compte.
 *
 * - Produits locaux : les quantités s'additionnent.
 * - Produits internationaux : les tickets sont vérifiés puis deviennent des devis enregistrés.
 * - Aucun nouvel appel à Apify.
 * - Rejouer la fusion ne crée pas de doublon.
 */
export async function mergeGuestCart(
  userId: string,
  input: unknown
) {
  const parsed = mergeSchema.safeParse(input);

  if (!parsed.success) {
    throw new MergeInputError(
      `Panier invité invalide : ${MAX_MERGE_ITEMS} articles maximum. Les quantités doivent être des entiers compris entre 1 et 999.`
    );
  }

  const results = await prisma.$transaction(
    async (tx) => {
      const cart = await lockedCart(tx, userId);

      const out: MergeItemResult[] = [];

      for (const [index, item] of parsed.data.items.entries()) {
        if (item.type === "LOCAL") {
          out.push(
            await mergeLocalItem(
              tx,
              cart.id,
              index,
              item.productId,
              item.quantity
            )
          );
        } else {
          out.push(
            await mergeInternationalItem(
              tx,
              cart.id,
              userId,
              index,
              item.ticket,
              item.options,
              item.quantity
            )
          );
        }
      }

      return out;
    },
    {
      maxWait: 5000,
      timeout: 30000,
    }
  );

  return {
    results,
    cart: await getCartByUser(userId),
  };
}

async function mergeLocalItem(
  tx: Tx,
  cartId: string,
  index: number,
  productId: string,
  quantity: number
): Promise<MergeItemResult> {
  const base = {
    index,
    type: "LOCAL" as const,
  };

  const product = await tx.product.findUnique({
    where: { id: productId },
    include: {
      inventory: {
        select: { quantity: true },
      },
      subCategory: categoryChainSelect,
    },
  });

  if (
    !product ||
    !product.isActive ||
    !isCategoryActive(product.subCategory)
  ) {
    return {
      ...base,
      status: "REJECTED",
      reason: "Produit indisponible.",
    };
  }

  const existing = await tx.cartItem.findUnique({
    where: {
      cartId_productId: {
        cartId,
        productId,
      },
    },
  });

  let desired = (existing?.quantity ?? 0) + quantity;

  let status: MergeItemStatus = existing
    ? "MERGED"
    : "ADDED";

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
      await tx.cartItem.update({
        where: { id: existing.id },
        data: { quantity: desired },
      });
    }

    return {
      ...base,
      status,
      reason,
      quantity: desired,
      itemId: existing.id,
    };
  }

  const created = await tx.cartItem.create({
    data: {
      cartId,
      productId,
      quantity: desired,
    },
  });

  return {
    ...base,
    status,
    reason,
    quantity: desired,
    itemId: created.id,
  };
}

async function mergeInternationalItem(
  tx: Tx,
  cartId: string,
  userId: string,
  index: number,
  rawTicket: string,
  options: string | undefined,
  quantity: number
): Promise<MergeItemResult> {
  const base = {
    index,
    type: "INTERNATIONAL" as const,
  };

  let ticket;

  try {
    ticket = verifyQuotePreviewTicket(rawTicket);
  } catch {
    return {
      ...base,
      status: "REJECTED",
      reason:
        "Ticket invalide ou expiré : refaites l'aperçu du produit.",
    };
  }

  // Un ticket ne crée jamais deux devis.
  let quote = await tx.internationalQuote.findUnique({
    where: { previewId: ticket.id },
  });

  if (quote && quote.userId !== userId) {
    return {
      ...base,
      status: "REJECTED",
      reason: "Ce ticket a déjà été utilisé.",
    };
  }

  if (!quote) {
    try {
      quote = await createQuoteFromTicket(
        tx,
        userId,
        ticket,
        options
      );
    } catch (error) {
      if (error instanceof QuoteTicketError) {
        return {
          ...base,
          status: "REJECTED",
          reason: error.message,
        };
      }

      throw error;
    }
  }

  const result = await attachQuote(
    tx,
    cartId,
    quote,
    quantity
  );

  if (result.status === "REJECTED") {
    return {
      ...base,
      status: "REJECTED",
      reason: result.reason,
      quoteId: quote.id,
    };
  }

  return {
    ...base,
    status: result.status,
    itemId: result.itemId,
    quoteId: quote.id,
    quantity:
      result.status === "ADDED"
        ? quantity
        : undefined,
  };
}
