import { prisma } from "../lib/prisma";
import { Prisma } from "../../generated/prisma/client";
import { allowedNextStatuses, getOrderKind } from "./orderFlow";
import { ConflictError, NotFoundError } from "../utils/appError";

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

export async function getOrderDetails(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { id: true, email: true, phone: true } },
      items: { include: { product: { include: { images: true } }, quote: true } },
      payments: true,
      trackingEvents: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: { actor: { select: { id: true, email: true } } },
      },
    },
  });

  if (!order) throw new NotFoundError("Commande introuvable");

  const kind = getOrderKind(order.items);
  const current = order.trackingEvents.at(-1)?.status ?? null;

  return {
    ...order,
    kind,
    currentTrackingStatus: current,
    // Liste vide tant que la commande n'est pas PAID : l'interface sait quoi proposer.
    allowedNextStatuses: order.status === "PAID" ? allowedNextStatuses(kind, current) : [],
  };
}

export async function getAdminStats() {

  const totalUsers =
    await prisma.user.count();

  const totalOrders =
    await prisma.order.count();

  const paidOrders =
    await prisma.order.count({

      where: { status: { in: ["PAID", "DELIVERED"] } }

    });

  const revenueResult =
    await prisma.order.aggregate({

     where: { status: { in: ["PAID", "DELIVERED"] } },

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


// ---------- Suppression d'un produit ----------

export async function deleteProduct(productId: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true },
      });
      if (!product) throw new NotFoundError("Produit introuvable");

      // Un produit déjà commandé garde sa trace dans les commandes : on l'archive.
      const ordered = await tx.orderItem.count({ where: { productId } });
      if (ordered > 0) {
        await tx.product.update({ where: { id: productId }, data: { isActive: false } });
        return {
          deleted: false,
          archived: true,
          message:
            "Ce produit figure dans des commandes : il ne peut pas être supprimé. Il a été désactivé (invisible côté client).",
        };
      }

      await tx.cartItem.deleteMany({ where: { productId } });
      await tx.product.delete({ where: { id: productId } });
      return { deleted: true, archived: false, message: "Produit supprimé" };
    });
  } catch (error: any) {
    // Le produit vient d'être commandé pendant la suppression.
    if (error?.code === "P2003") {
      throw new ConflictError(
        "Le produit vient d'être commandé : réessaie pour l'archiver.",
        "PRODUCT_IN_USE"
      );
    }
    throw error;
  }
}

// ---------- Tableau de bord ----------

// Payées, mais rien n'a encore été fait au-delà de la validation.
const sansSuite: Prisma.OrderWhereInput["trackingEvents"] = {
  none: { status: { not: "ORDER_VALIDATED" } },
};

const aAcheter: Prisma.OrderWhereInput = {
  status: "PAID",
  items: { some: { quoteId: { not: null } } },
  trackingEvents: sansSuite,
};

const aPreparer: Prisma.OrderWhereInput = {
  status: "PAID",
  items: { none: { quoteId: { not: null } } },
  trackingEvents: sansSuite,
};

export async function getAdminDashboard() {
  const [
    internationalToPurchase,
    quotesPendingReview,
    localToPrepare,
    partiallyPaid,
    outOfStockProducts,
  ] = await Promise.all([
    prisma.order.count({ where: aAcheter }),
    prisma.internationalQuote.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.order.count({ where: aPreparer }),
    prisma.order.count({ where: { status: "PARTIALLY_PAID" } }),
    prisma.product.count({
      where: { type: "LOCAL", isActive: true, inventory: { quantity: { lte: 0 } } },
    }),
  ]);

  return {
    internationalToPurchase,
    quotesPendingReview,
    localToPrepare,
    partiallyPaid,
    outOfStockProducts,
  };
}

/** Commandes payées dont les articles internationaux restent à acheter (les plus anciennes d'abord). */
export async function getInternationalOrdersToPurchase() {
  return prisma.order.findMany({
    where: aAcheter,
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      createdAt: true,
      totalAmount: true,
      user: { select: { id: true, email: true, phone: true } },
      // quoteSnapshot = copie figée : lien, nom, options et prix tels que le client les a payés.
      items: {
        where: { quoteId: { not: null } },
        select: { id: true, quantity: true, price: true, quoteSnapshot: true },
      },
    },
  });
}