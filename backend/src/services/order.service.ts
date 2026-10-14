import { prisma } from "../lib/prisma";
import { reserveStockForOrder } from "./inventory.service";

// Les montants sont calculés en centimes pour éviter les erreurs de virgule flottante.
const toCents = (value: unknown) => Math.round(Number(value) * 100);

// Create order from user cart
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

    for (const item of cart.items) {
      if (!item.product.isActive) {
        throw new Error(
          `Le produit « ${item.product.name} » n'est plus disponible`
        );
      }
    }

    const lines = cart.items.map((item) => {
      const basePriceCents = toCents(item.product.price);
      const marginCents = toCents(item.product.margin);
      return {
        item,
        basePrice: basePriceCents / 100,
        margin: marginCents / 100,
        price: (basePriceCents + marginCents) / 100,
        lineCents: (basePriceCents + marginCents) * item.quantity,
      };
    });

    const productsAmount =
      lines.reduce((sum, l) => sum + l.lineCents, 0) / 100;

    // Transport calculé plus tard
    const shippingAmount = 0;
    const totalAmount = productsAmount + shippingAmount;

    const createdOrder = await tx.order.create({
      data: {
        userId,
        productsAmount,
        shippingAmount,
        totalAmount,
        status: "PENDING_PAYMENT",
        items: {
          create: lines.map((l) => ({
            productId: l.item.productId,
            quantity: l.item.quantity,
            basePrice: l.basePrice,
            margin: l.margin,
            price: l.price,
          })),
        },
      },
      include: { items: true },
    });

    // Réservation du stock des produits locaux (échoue => tout est annulé)
    await reserveStockForOrder(
      tx,
      createdOrder.id,
      cart.items
        .filter((item) => item.product.type === "LOCAL")
        .map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        }))
    );

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