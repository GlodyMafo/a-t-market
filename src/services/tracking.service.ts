import { prisma } from "../lib/prisma";
import { TRACKING_LABELS } from "./orderFlow";
import { NotFoundError } from "../utils/appError";

export async function getTrackingByOrder(orderId: string, userId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    select: {
      trackingEvents: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true, status: true, message: true, createdAt: true },
      },
    },
  });

  if (!order) throw new NotFoundError("Commande introuvable");

  return order.trackingEvents.map((e) => ({ ...e, label: TRACKING_LABELS[e.status] }));
}