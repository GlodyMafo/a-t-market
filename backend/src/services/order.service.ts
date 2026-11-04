import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { reserveStockForOrder } from "./inventory.service";
import {
  activeOrderQuoteIds,
  quoteIssue,
  quoteIssueMessage,
} from "./quoteEligibility";
import { quoteSnapshot } from "./quoteSnapshot";
import type { Paging } from "../utils/pagination";
import {
  categoryChainSelect,
  isCategoryActive,
} from "./productAvailability";
import { detectProductMarketplace } from "./productUrl";
import { computeQuote } from "./pricing.service";

import {
  formatUsd,
  orderRef,
  publishNotification,
  recordNotification,
} from "./notification.service";


const Decimal = Prisma.Decimal;

/**
 * Recalcule le devis 1688 pour la quantité demandée.
 *
 * Le prix et le poids enregistrés dans le devis sont unitaires.
 * Le transport et la commission sont calculés sur les totaux.
 * Les frais fixes ne sont appliqués qu'une seule fois.
 */
function calculate1688CartPricing(
  quote: {
    productPrice: Prisma.Decimal;
    productWeight: Prisma.Decimal | null;
    commissionRate: Prisma.Decimal | null;
    chinaPricePerKg: Prisma.Decimal | null;
    fixedFee: Prisma.Decimal | null;
  },
  quantity: number
) {
  if (
    quote.commissionRate === null ||
    quote.chinaPricePerKg === null ||
    quote.fixedFee === null
  ) {
    throw new Error(
      "Les paramètres tarifaires du devis 1688 sont incomplets."
    );
  }

  return computeQuote({
    productPrice: quote.productPrice.mul(quantity),
    weightKg:
      quote.productWeight === null
        ? null
        : quote.productWeight.mul(quantity),
    settings: {
      commissionRate: quote.commissionRate,
      chinaPricePerKg: quote.chinaPricePerKg,
      fixedFee: quote.fixedFee,
    },
  });
}

/**
 * Crée une commande à partir du panier : produits locaux et devis internationaux.
 *
 * - Produits locaux : le stock est réservé (échec => tout est annulé).
 * - Devis internationaux : chacun doit être payable.
 * - 1688 : le MOQ est contrôlé avant la création de la commande.
 * - 1688 : prix et poids sont recalculés selon la quantité du panier.
 * - SHEIN et NOON : calcul et quantité historiques conservés.
 */
export async function createOrderFromCart(userId: string) {
  const cartRef = await prisma.cart.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!cartRef) {
    throw new Error("Panier introuvable");
  }

  const result = await prisma.$transaction(async (tx) => {
    // Verrouillage du panier pour éviter les commandes concurrentes.
    await tx.$queryRaw`
      SELECT id FROM "Cart" WHERE id = ${cartRef.id} FOR UPDATE
    `;

    const cart = await tx.cart.findUniqueOrThrow({
      where: { id: cartRef.id },
      include: {
        items: {
          include: {
            product: {
              include: {
                subCategory: categoryChainSelect,
              },
            },
          },
        },
      },
    });

    if (cart.items.length === 0) {
      throw new Error("Le panier est vide");
    }

    // Verrouillage des devis internationaux.
    const quoteIds = cart.items
      .flatMap((item) => (item.quoteId ? [item.quoteId] : []))
      .sort();

    if (quoteIds.length > 0) {
      await tx.$queryRaw`
        SELECT id FROM "InternationalQuote"
        WHERE id IN (${Prisma.join(quoteIds)})
        ORDER BY id
        FOR UPDATE
      `;
    }

    const quotes = await tx.internationalQuote.findMany({
      where: {
        id: { in: quoteIds },
        userId,
      },
    });

    const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));
    const ordered = await activeOrderQuoteIds(tx, quoteIds);

    // Contrôle de tous les articles avant toute création.
    const problems: string[] = [];

    for (const item of cart.items) {
      if (item.quoteId) {
        const quote = quoteById.get(item.quoteId);

        if (!quote) {
          problems.push("Un devis de votre panier est introuvable.");
          continue;
        }

        const issue = quoteIssue(
          quote,
          ordered.has(quote.id)
        );

        if (issue) {
          problems.push(
            quoteIssueMessage(issue, quote.productName)
          );
        }

        const marketplace = detectProductMarketplace(
          quote.productUrl
        );

        if (marketplace === "1688") {
          if (
            quote.minOrderQuantity !== null &&
            quote.minOrderQuantity > 0 &&
            item.quantity < quote.minOrderQuantity
          ) {
            problems.push(
              `Quantité insuffisante pour « ${quote.productName ?? "produit 1688"} » : minimum requis ${quote.minOrderQuantity}, quantité demandée ${item.quantity}.`
            );
          }

          // Vérifie également les paramètres et les limites tarifaires
          // avant de commencer la création de la commande.
          try {
            calculate1688CartPricing(quote, item.quantity);
          } catch (error) {
            problems.push(
              error instanceof Error
                ? `Devis 1688 « ${quote.productName ?? "sans nom"} » : ${error.message}`
                : "Impossible de calculer le prix du devis 1688."
            );
          }
        } else if (item.quantity !== 1) {
          // Défense supplémentaire : SHEIN et NOON restent à quantité 1.
          problems.push(
            `La quantité des devis SHEIN et NOON doit rester égale à 1 (${quote.productName ?? "produit"}).`
          );
        }
      } else if (
        !item.product ||
        !item.product.isActive ||
        !isCategoryActive(item.product.subCategory)
      ) {
        problems.push(
          `Le produit « ${item.product?.name ?? "inconnu"} » n'est plus disponible`
        );
      }
    }

    if (problems.length > 0) {
      throw new Error(problems.join(" "));
    }

    // Calcul des montants en Decimal.
    let productsAmount = new Decimal(0);
    let shippingAmount = new Decimal(0);

    const itemsData: Prisma.OrderItemCreateWithoutOrderInput[] = [];
    const stockLines: { productId: string; quantity: number }[] = [];

    for (const item of cart.items) {
      if (item.quoteId) {
        const quote = quoteById.get(item.quoteId)!;

        const marketplace = detectProductMarketplace(
          quote.productUrl
        );

        if (marketplace === "1688") {
          const pricing = calculate1688CartPricing(
            quote,
            item.quantity
          );

          const shippingPart = pricing.shippingCost.plus(
            pricing.customsCost
          );

          // productsAmount contient le produit, la commission et les frais fixes.
          // shippingAmount contient uniquement le transport et les douanes.
          productsAmount = productsAmount
            .plus(pricing.productPrice)
            .plus(pricing.commissionCost)
            .plus(pricing.fixedFee);

          shippingAmount = shippingAmount.plus(shippingPart);

          itemsData.push({
            quote: { connect: { id: quote.id } },
            quantity: item.quantity,
            basePrice: quote.productPrice,
            margin: pricing.totalPrice.minus(pricing.productPrice),
            price: pricing.totalPrice,
            // Le devis d'origine reste inchangé et constitue la référence historique.
            quoteSnapshot: quoteSnapshot(quote),
          });
        } else {
          // SHEIN et NOON : comportement historique inchangé.
          const shippingPart = quote.shippingCost.plus(
            quote.customsCost
          );

          shippingAmount = shippingAmount.plus(shippingPart);

          productsAmount = productsAmount.plus(
            quote.totalPrice.minus(shippingPart)
          );

          itemsData.push({
            quote: { connect: { id: quote.id } },
            quantity: 1,
            basePrice: quote.productPrice,
            margin: quote.totalPrice.minus(quote.productPrice),
            price: quote.totalPrice,
            quoteSnapshot: quoteSnapshot(quote),
          });
        }
      } else {
        const product = item.product!;
        const unitPrice = new Decimal(product.price).plus(
          product.margin
        );

        productsAmount = productsAmount.plus(
          unitPrice.mul(item.quantity)
        );

        itemsData.push({
          product: { connect: { id: product.id } },
          quantity: item.quantity,
          basePrice: product.price,
          margin: product.margin,
          price: unitPrice,
        });

        if (product.type === "LOCAL") {
          stockLines.push({
            productId: product.id,
            quantity: item.quantity,
          });
        }
      }
    }

    const totalAmount = productsAmount.plus(shippingAmount);

    const createdOrder = await tx.order.create({
      data: {
        userId,
        productsAmount,
        shippingAmount,
        totalAmount,
        status: "PENDING_PAYMENT",
        items: {
          create: itemsData,
        },
      },
      include: {
        items: true,
      },
    });

    // Réservation du stock local : toute erreur annule la transaction.
    await reserveStockForOrder(
      tx,
      createdOrder.id,
      stockLines
    );

    await tx.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    const notification = await recordNotification(tx, {
      userId,
      type: "ORDER_CREATED",
      orderId: createdOrder.id,
      title: "Commande créée",
      message: `Votre commande ${orderRef(createdOrder.id)} a été créée. Montant total : ${formatUsd(createdOrder.totalAmount)}.`,
      emailWanted: true,
      data: {
        totalAmount: createdOrder.totalAmount.toString(),
      },
    });

    return {
      createdOrder,
      notification,
    };
  });

  publishNotification(result.notification);

  return result.createdOrder;
}

// Get all orders by user

export async function countOrdersByUser(userId: string) {
  return prisma.order.count({
    where: { userId },
  });
}

export async function getOrdersByUser(
  userId: string,
  paging?: Paging
) {
  return prisma.order.findMany({
    ...paging,
    where: { userId },
    include: {
      items: {
        include: {
          product: {
            include: {
              images: true,
            },
          },
        },
      },
    },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
  });
}

export async function getOrderById(
  id: string,
  userId: string
) {
  const order = await prisma.order.findFirst({
    where: {
      id,
      userId,
    },
    include: {
      items: {
        include: {
          product: {
            include: {
              images: true,
            },
          },
        },
      },
      payments: true,
      trackingEvents: {
        orderBy: [
          { createdAt: "asc" },
          { id: "asc" },
        ],
        select: {
          id: true,
          status: true,
          message: true,
          createdAt: true,
        },
      },
    },
  });

  if (!order) {
    throw new Error("Commande introuvable");
  }

  return order;
}
