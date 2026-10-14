import { prisma } from "../lib/prisma";
import { TrackingStatus } from "../../generated/prisma/client";

interface UpdateProductData {
  name?: string;
  description?: string;
  price?: number;
  margin?: number;
}

export async function getAllOrders() {

  const orders =
    await prisma.order.findMany({

      include: {

        user: {

          select: {
            id: true,
            email: true,
            phone: true
          }

        },

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

      },

      orderBy: {

        createdAt: "desc"

      }

    });

  return orders;

}


export async function getOrderDetails(
  orderId: string
) {

  const order =
    await prisma.order.findUnique({

      where: {
        id: orderId
      },

      include: {

        user: {

          select: {
            id: true,
            email: true,
            phone: true
          }

        },

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

        trackingEvents: {

          orderBy: {
            createdAt: "asc"
          }

        }

      }

    });

  if (!order) {

    throw new Error(
      "Commande introuvable"
    );

  }

  return order;

}

export async function addTrackingToOrder(
  orderId: string,
  status: TrackingStatus,
  message?: string
) {

  const order =
    await prisma.order.findUnique({

      where: {
        id: orderId
      }

    });

  if (!order) {

    throw new Error(
      "Commande introuvable"
    );

  }

  const event =
    await prisma.trackingEvent.create({

      data: {

        orderId,

        status,

        message

      }

    });

  return event;

}

export async function getAdminStats() {

  const totalUsers =
    await prisma.user.count();

  const totalOrders =
    await prisma.order.count();

  const paidOrders =
    await prisma.order.count({

      where: {
        status: "PAID"
      }

    });

  const revenueResult =
    await prisma.order.aggregate({

      where: {
        status: "PAID"
      },

      _sum: {
        totalAmount: true
      }

    });

  return {

    totalUsers,

    totalOrders,

    paidOrders,

    totalRevenue:
      Number(
        revenueResult._sum.totalAmount || 0
      )

  };

}

export async function getAllProductsAdmin() {

  const products =
    await prisma.product.findMany({

      include: {

        images: true,

        inventory: true

      },

      orderBy: {

        createdAt: "desc"

      }

    });

  return products;

}

export async function toggleProductStatus(
  productId: string
) {

  const product =
    await prisma.product.findUnique({

      where: {
        id: productId
      }

    });

  if (!product) {

    throw new Error(
      "Produit introuvable"
    );

  }

  const updatedProduct =
    await prisma.product.update({

      where: {
        id: productId
      },

      data: {

        isActive:
          !product.isActive

      },

      include: {

        images: true,

        inventory: true

      }

    });

  return updatedProduct;

}


export async function updateProduct(
  productId: string,
  data: UpdateProductData
) {

  const product =
    await prisma.product.findUnique({

      where: {
        id: productId
      }

    });

  if (!product) {

    throw new Error(
      "Produit introuvable"
    );

  }

  const updatedProduct =
    await prisma.product.update({

      where: {
        id: productId
      },

      data,

      include: {

        images: true,

        inventory: true

      }

    });

  return updatedProduct;

}


export async function getInventory() {

  return prisma.inventory.findMany({

    include: {

      product: {

        include: {

          images: true

        }

      }

    },

    orderBy: {

      updatedAt: "desc"

    }

  });

}

export async function updateInventory(
  productId: string,
  quantity: number
) {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error(
      "Le stock doit être un entier positif ou nul"
    );
  }

  return prisma.$transaction(async (tx) => {
    // On verrouille la ligne de stock : une réservation qui arrive en même temps
    // ne peut pas être écrasée par cette correction.
    const rows = await tx.$queryRaw<{ quantity: number }[]>`
      SELECT quantity FROM "Inventory"
      WHERE "productId" = ${productId}
      FOR UPDATE
    `;

    if (rows.length === 0) {
      throw new Error("Inventaire introuvable");
    }

    const before = rows[0].quantity;
    const difference = quantity - before;

    const updated = await tx.inventory.update({
      where: { productId },
      data: { quantity },
      include: { product: true }
    });

    // Chaque changement de stock laisse une trace
    if (difference !== 0) {
      await tx.inventoryMovement.create({
        data: {
          productId,
          quantity: Math.abs(difference),
          type: difference > 0 ? "IN" : "OUT",
          reason: `Ajustement admin (${before} → ${quantity})`
        }
      });
    }

    return updated;
  });
}

export async function restockInventory(
  productId: string,
  quantity: number,
  reason?: string
) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(
      "La quantité doit être un entier supérieur à 0"
    );
  }

  return prisma.$transaction(async (tx) => {
    // Incrément atomique (et non "ancienne valeur + n") : ne peut pas écraser
    // une réservation concurrente.
    const result = await tx.inventory.updateMany({
      where: { productId },
      data: { quantity: { increment: quantity } }
    });

    if (result.count === 0) {
      throw new Error("Inventaire introuvable");
    }

    await tx.inventoryMovement.create({
      data: {
        productId,
        quantity,
        type: "IN",
        reason: reason || "Réapprovisionnement"
      }
    });

    return tx.inventory.findUniqueOrThrow({
      where: { productId }
    });
  });
}