import { prisma } from "../lib/prisma";
import { TrackingStatus } from "../../generated/prisma";

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

  if (quantity < 0) {

    throw new Error(
      "Le stock ne peut pas être négatif"
    );

  }

  const inventory =
    await prisma.inventory.findUnique({

      where: {
        productId
      }

    });

  if (!inventory) {

    throw new Error(
      "Inventaire introuvable"
    );

  }

  return prisma.inventory.update({

    where: {
      productId
    },

    data: {
      quantity
    },

    include: {

      product: true

    }

  });

}