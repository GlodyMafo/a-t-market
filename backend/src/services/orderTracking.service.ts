import type { OrderStatus, TrackingStatus } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { ConflictError, NotFoundError } from "../utils/appError";
import { assertTransition, getOrderKind, InvalidTransitionError } from "./orderFlow";

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

/**
 * Seul point d'entrée pour faire avancer une commande (livraison, achat, etc.).
 * Sous verrou de la commande : deux admins qui postent en même temps passent l'un après l'autre.
 */
export async function postTrackingEvent(input: {
  orderId: string;
  status: TrackingStatus;
  message?: string;
  actorId: string;
}) {
  const { orderId, status, message, actorId } = input;

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE
    `;
    if (locked.length === 0) throw new NotFoundError("Commande introuvable");

    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, items: { select: { quoteId: true } } },
    });

    // Règle : « livré » (et tout autre statut) est impossible sur une commande non payée.
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
        // Horloge prise APRÈS le verrou : l'ordre des événements reste fiable
        // même si deux requêtes ont démarré en même temps.
        createdAt: new Date(),
      },
    });

    if (status === "DELIVERED") {
      await tx.order.update({ where: { id: orderId }, data: { status: "DELIVERED" } });
    }

    return event;
  });
}