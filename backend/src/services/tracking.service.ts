import { prisma } from "../lib/prisma";

export async function getTrackingByOrder(
  orderId: string,
  userId: string
) {

  const order =
    await prisma.order.findFirst({

      where: {
        id: orderId,
        userId
      },

      include: {

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

  return order.trackingEvents;

}


export async function addTrackingEvent(
  orderId: string,
  status:
    | "ORDER_VALIDATED"
    | "PURCHASED"
    | "PREPARING"
    | "IN_CHINA"
    | "IN_TRANSIT"
    | "ARRIVED_DRC"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED",
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