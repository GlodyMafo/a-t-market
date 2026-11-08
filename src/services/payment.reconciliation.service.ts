import { prisma } from "../lib/prisma";
import { settlePaymentByDepositId } from "./payment.settlement.service";

const EXPIRATION_MS = 24 * 60 * 60 * 1000;

/**
 * Filet de sécurité : revérifie chez PawaPay les paiements restés PENDING
 * (callback perdu, serveur indisponible…), avec la MÊME logique que le callback.
 */
export async function reconcilePendingPayments() {
  const payments = await prisma.payment.findMany({
    where: { status: "PENDING" },
    select: { id: true, providerReference: true, createdAt: true },
  });

  console.log("PENDING PAYMENTS:", payments.length);

  const expirationLimit = new Date(Date.now() - EXPIRATION_MS);

  for (const payment of payments) {
    try {
      let outcome = "STILL_PENDING";

      if (payment.providerReference) {
        const result = await settlePaymentByDepositId(payment.providerReference);
        outcome = result.outcome;
      }

      // On n'expire que si PawaPay n'a pas de statut final.
      // Jamais si une vérification a échoué (de l'argent a peut-être été reçu).
      if (outcome === "STILL_PENDING" && payment.createdAt < expirationLimit) {
        await prisma.payment.updateMany({
          where: { id: payment.id, status: "PENDING" },
          data: { status: "EXPIRED" },
        });
        console.log("PAYMENT EXPIRED:", payment.id);
      }
    } catch (error: any) {
      console.error("RECONCILIATION ERROR:", payment.id, error.message);
    }
  }
}