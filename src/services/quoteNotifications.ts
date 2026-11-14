import { prisma } from "../lib/prisma";
import {
  formatUsd,
  publishNotification,
  recordNotification,
  type RecordedNotification,
} from "./notification.service";

const label = (name: string | null) => `« ${name?.trim() || "Produit importé"} »`;

/** Notification du client quand son devis est approuvé (à enregistrer dans la transaction d'approbation). */
export function approvedNotification(quote: {
  id: string;
  userId: string;
  productName: string | null;
  totalPrice: unknown;
  expiresAt: Date | null;
}) {
  const until = quote.expiresAt ? ` Prix valable jusqu'au ${quote.expiresAt.toLocaleDateString("fr-FR")}.` : "";
  return {
    userId: quote.userId,
    type: "QUOTE_APPROVED" as const,
    title: "Votre devis est prêt",
    message: `${label(quote.productName)} : ${formatUsd(quote.totalPrice)} livré en RDC. Vous pouvez le payer depuis votre panier.${until}`,
    data: { quoteId: quote.id },
  };
}

/** Notification du client quand son devis est rejeté, avec le motif de l'administrateur. */
export function rejectedNotification(quote: { id: string; userId: string; productName: string | null }, note: string) {
  return {
    userId: quote.userId,
    type: "QUOTE_REJECTED" as const,
    title: "Votre devis a été refusé",
    message: `${label(quote.productName)} n'a pas pu être accepté : ${note}`,
    data: { quoteId: quote.id },
  };
}

/**
 * Prévient les administrateurs des devis à valider, une seule fois par devis.
 * À appeler après tout ajout qui peut créer un devis « à valider ». Ne lève jamais d'erreur :
 * l'alerte ne doit jamais faire échouer le panier du client.
 */
export async function notifyAdminsOfPendingQuotes(): Promise<void> {
  try {
    const records: RecordedNotification[] = [];

    await prisma.$transaction(async (tx) => {
      const pending = await tx.internationalQuote.findMany({
        where: { status: "PENDING_REVIEW", adminNotifiedAt: null },
        select: { id: true, productName: true },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      if (pending.length === 0) return;

      const admins = await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });

      for (const quote of pending) {
        // Réclamation atomique : deux appels simultanés ne préviennent pas deux fois pour le même devis.
        const claimed = await tx.internationalQuote.updateMany({
          where: { id: quote.id, adminNotifiedAt: null, status: "PENDING_REVIEW" },
          data: { adminNotifiedAt: new Date() },
        });
        if (claimed.count === 0) continue;

        for (const admin of admins) {
          records.push(
            await recordNotification(tx, {
              userId: admin.id,
              type: "QUOTE_PENDING_REVIEW",
              title: "Devis à valider",
              message: `${label(quote.productName)} attend votre validation.`,
              data: { quoteId: quote.id },
            }),
          );
        }
      }
    });

    records.forEach((record) => publishNotification(record)); // après la validation de la transaction
  } catch (error) {
    console.error("NOTIFICATIONS DEVIS : impossible de prévenir les administrateurs :", error instanceof Error ? error.message : error);
  }
}