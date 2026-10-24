import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { reserveStockForOrder } from "./inventory.service";
import { activeOrderQuoteIds, quoteIssue, quoteIssueMessage } from "./quoteEligibility";
import { quoteSnapshot } from "./quoteSnapshot";

const Decimal = Prisma.Decimal;

/**
 * Crée une commande à partir du panier : produits locaux ET devis internationaux.
 *
 * - Produits locaux : le stock est réservé (échec => tout est annulé).
 * - Devis : chacun doit être PAYABLE (validé, non périmé, non déjà commandé) : règle D.
 *   Son prix est alors FIGÉ dans la commande (copie dans quoteSnapshot).
 * - Un seul article refusé bloque la commande entière, avec un message qui explique pourquoi.
 *
 * Répartition des montants : shippingAmount = transport des devis ;
 * productsAmount = tout le reste ; totalAmount = la somme.
 */
export async function createOrderFromCart(userId: string) {
  const cartRef = await prisma.cart.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!cartRef) {
    throw new Error("Panier introuvable");
  }

  return prisma.$transaction(async (tx) => {
    // On verrouille le panier : un double clic sur "Commander" ne crée qu'une commande
    // (le second appel attend, puis trouve un panier vide).
    await tx.$queryRaw`SELECT id FROM "Cart" WHERE id = ${cartRef.id} FOR UPDATE`;

    const cart = await tx.cart.findUniqueOrThrow({
      where: { id: cartRef.id },
      include: { items: { include: { product: true } } },
    });

    if (cart.items.length === 0) {
      throw new Error("Le panier est vide");
    }

    // --- Devis : verrou, puis relecture à jour (un admin a pu changer le statut entre-temps) ---
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
      where: { id: { in: quoteIds }, userId },
    });
    const quoteById = new Map(quotes.map((q) => [q.id, q]));
    const ordered = await activeOrderQuoteIds(tx, quoteIds);

    // --- Contrôle de TOUS les articles : on signale tous les problèmes d'un coup ---
    const problems: string[] = [];

    for (const item of cart.items) {
      if (item.quoteId) {
        const quote = quoteById.get(item.quoteId);
        if (!quote) {
          problems.push("Un devis de votre panier est introuvable.");
          continue;
        }
        const issue = quoteIssue(quote, ordered.has(quote.id));
        if (issue) problems.push(quoteIssueMessage(issue, quote.productName));
      } else if (!item.product || !item.product.isActive) {
        problems.push(
          `Le produit « ${item.product?.name ?? "inconnu"} » n'est plus disponible`
        );
      }
    }

    if (problems.length > 0) {
      throw new Error(problems.join(" "));
    }

    // --- Montants, en décimal exact ---
    let productsAmount = new Decimal(0);
    let shippingAmount = new Decimal(0);

    const itemsData: Prisma.OrderItemCreateWithoutOrderInput[] = [];
    const stockLines: { productId: string; quantity: number }[] = [];

    for (const item of cart.items) {
      if (item.quoteId) {
        const quote = quoteById.get(item.quoteId)!;
        const shippingPart = quote.shippingCost.plus(quote.customsCost);

        shippingAmount = shippingAmount.plus(shippingPart);
        productsAmount = productsAmount.plus(quote.totalPrice.minus(shippingPart));

        itemsData.push({
          quote: { connect: { id: quote.id } },
          quantity: 1,
          basePrice: quote.productPrice,
          margin: quote.totalPrice.minus(quote.productPrice),
          price: quote.totalPrice,
          quoteSnapshot: quoteSnapshot(quote),
        });
      } else {
        const product = item.product!;
        const unitPrice = new Decimal(product.price).plus(product.margin);

        productsAmount = productsAmount.plus(unitPrice.mul(item.quantity));

        itemsData.push({
          product: { connect: { id: product.id } },
          quantity: item.quantity,
          basePrice: product.price,
          margin: product.margin,
          price: unitPrice,
        });

        if (product.type === "LOCAL") {
          stockLines.push({ productId: product.id, quantity: item.quantity });
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
        items: { create: itemsData },
      },
      include: { items: true },
    });

    // Réservation du stock des produits locaux (échoue => tout est annulé)
    await reserveStockForOrder(tx, createdOrder.id, stockLines);

    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    return createdOrder;
  });
}

// Get all orders by user

export async function getOrdersByUser(
  userId: string
) {


  const orders =
    await prisma.order.findMany({

      where: {
        userId
      },


      include: {

        items: {

          include: {

            product: {

              include: {

                images: true

              }

            }

          }

        }

      },


      orderBy: {

        createdAt: "desc"

      }

    });


  return orders;

}

export async function getOrderById(
  id: string,
  userId: string
) {

  const order =
    await prisma.order.findFirst({

      where: {

        id,

        userId

      },

      include: {

        items: {

          include: {

            product: {

              include: {

                images: true

              }

            }

          }

        },

        payments: true,

        trackingEvents: true

      }

    });

  if (!order) {

    throw new Error(
      "Commande introuvable"
    );

  }


  return order;

}