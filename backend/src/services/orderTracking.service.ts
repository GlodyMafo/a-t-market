import type { OrderStatus, TrackingStatus } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { ConflictError, NotFoundError } from "../utils/appError";
import { orderRef, publishNotification, recordNotification } from "./notification.service";
import {
  assertTransition,
  getOrderKind,
  InvalidTransitionError,
  TRACKING_LABELS,
} from "./orderFlow";

function refusCommande(status: OrderStatus) {
  if (status === "DELIVERED") {
    return new ConflictError(
      "Cette commande est déjà livrée : son suivi est terminé.",
      "ORDER_ALREADY_DELIVERED"
    );
  }
  if (status === "CANCELLED") {
    return new ConflictError(
      "Cette commande est annulée : son suivi ne peut pas être modifié.",
      "ORDER_CANCELLED"
    );
  }
  return new ConflictError(
    "Cette commande n'est pas entièrement payée : son suivi ne peut pas être modifié.",
    "ORDER_NOT_PAID"
  );
}

export async function postTrackingEvent(input: {
  orderId: string;
  status: TrackingStatus;
  message?: string;
  actorId: string;
}) {
  const { orderId, status, message, actorId } = input;

  const { event, note } = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE
    `;
    if (locked.length === 0) throw new NotFoundError("Commande introuvable");

    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, userId: true, items: { select: { quoteId: true } } },
    });

    if (order.status !== "PAID") throw refusCommande(order.status);

    const last = await tx.trackingEvent.findFirst({
      where: { orderId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { status: true },
    });
    const from = last?.status ?? null;

    try {
      assertTransition(getOrderKind(order.items), from, status);
    } catch (error) {
      if (error instanceof InvalidTransitionError) {
        throw new ConflictError(error.message, "INVALID_TRANSITION");
      }
      throw error;
    }

    const event = await tx.trackingEvent.create({
      data: {
        orderId,
        status,
        fromStatus: from,
        actorId,
        message,
        createdAt: new Date(),
      },
    });

    if (status === "DELIVERED") {
      await tx.order.update({ where: { id: orderId }, data: { status: "DELIVERED" } });
    }

    // Notification du client, dans la même transaction : pas de changement de statut sans trace.
    const label = TRACKING_LABELS[status];
    const note = await recordNotification(tx, {
      userId: order.userId,
      type: "ORDER_STATUS_CHANGED",
      orderId,
      title: label,
      message: `Commande ${orderRef(orderId)} : ${label}${message ? ` — ${message}` : ""}`,
      data: { status, label },
    });

    return { event, note };
  });

  // Livraison temps réel APRÈS le commit : si l'envoi échoue, le changement de statut reste enregistré.
  publishNotification(note);

  return event;
}