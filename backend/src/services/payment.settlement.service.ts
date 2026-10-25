import { prisma } from "../lib/prisma";
import {
  getDepositStatus,
  PawapayDepositStatus,
} from "./pawapay.status.service";

/** Devise utilisée pour tous les paiements (sandbox validé en USD). */
export const PAYMENT_CURRENCY = "USD";

export type SettlementOutcome =
  | "PAID" // le paiement vient d'être confirmé par PawaPay
  | "ALREADY_FINAL" // déjà PAID ou REFUNDED : rien à faire (idempotence)
  | "FAILED" // PawaPay confirme l'échec
  | "STILL_PENDING" // pas encore de statut final chez PawaPay
  | "UNKNOWN_PAYMENT" // aucun paiement chez nous pour ce depositId
  | "VERIFICATION_FAILED"; // PawaPay dit payé, mais montant/devise/identifiant incohérents

export interface SettlementResult {
  outcome: SettlementOutcome;
  paymentId?: string;
  reason?: string;
}

type FetchStatus = (depositId: string) => Promise<PawapayDepositStatus>;

// Les montants sont comparés en centimes pour éviter les erreurs d'arrondi flottant.
const toCents = (value: unknown) => Math.round(Number(value) * 100);

/**
 * Seul et unique point d'entrée pour faire passer un paiement à PAID ou FAILED.
 * Appelé par le callback PawaPay ET par la réconciliation.
 *
 * Principe : on ne croit JAMAIS le contenu d'un callback. On redemande à PawaPay
 * l'état réel du dépôt, puis on vérifie montant, devise et identifiant.
 */
export async function settlePaymentByDepositId(
  depositId: string,
  fetchStatus: FetchStatus = getDepositStatus
): Promise<SettlementResult> {
  const payment = await prisma.payment.findFirst({
    where: { providerReference: depositId },
  });

  if (!payment) {
    return { outcome: "UNKNOWN_PAYMENT" };
  }

  if (payment.status === "PAID" || payment.status === "REFUNDED") {
    return { outcome: "ALREADY_FINAL", paymentId: payment.id };
  }

  // Peut lever une erreur (réseau, HTTP) : l'appelant décide quoi faire.
  const remote = await fetchStatus(depositId);

  if (remote.status !== "FOUND" || !remote.data) {
    return {
      outcome: "STILL_PENDING",
      paymentId: payment.id,
      reason: `PawaPay a répondu ${remote.status}`,
    };
  }

  const remoteStatus = remote.data.status;

  // --- Échec confirmé par PawaPay ---
  if (remoteStatus === "FAILED") {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "FAILED" },
    });
    return { outcome: "FAILED", paymentId: payment.id };
  }

  // --- Tout statut non final (ACCEPTED, PROCESSING, IN_RECONCILIATION) : on attend ---
  if (remoteStatus !== "COMPLETED") {
    return {
      outcome: "STILL_PENDING",
      paymentId: payment.id,
      reason: `Statut PawaPay : ${remoteStatus}`,
    };
  }

  // --- COMPLETED : vérifications strictes avant de créditer ---
  const reasons: string[] = [];

  if (remote.data.depositId && remote.data.depositId !== depositId) {
    reasons.push("depositId différent");
  }
  if (remote.data.currency !== PAYMENT_CURRENCY) {
    reasons.push(`devise inattendue (${remote.data.currency})`);
  }
  if (
    remote.data.amount === undefined ||
    toCents(remote.data.amount) !== toCents(payment.amount.toString())
  ) {
    reasons.push(
      `montant inattendu (reçu ${remote.data.amount}, attendu ${payment.amount.toString()})`
    );
  }

  if (reasons.length > 0) {
    // Le paiement reste PENDING : un humain doit regarder (de l'argent a peut-être été reçu).
    console.error(
      `ALERTE PAIEMENT : dépôt ${depositId} COMPLETED chez PawaPay mais refusé : ${reasons.join(", ")}`
    );
    return {
      outcome: "VERIFICATION_FAILED",
      paymentId: payment.id,
      reason: reasons.join(", "),
    };
  }

  // --- Transaction atomique ---
  const outcome = await prisma.$transaction(async (tx) => {
    // On verrouille la commande : deux paiements de la même commande
    // réglés en même temps passent l'un après l'autre.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${payment.orderId} FOR UPDATE`;

    // Mise à jour conditionnelle : un seul appel "gagne" la transition vers PAID.
    const won = await tx.payment.updateMany({
      where: { id: payment.id, status: { notIn: ["PAID", "REFUNDED"] } },
      data: { status: "PAID" },
    });

    if (won.count === 0) {
      return "ALREADY_FINAL" as const;
    }

    const order = await tx.order.findUnique({
      where: { id: payment.orderId },
      select: { status: true, totalAmount: true },
    });

    // On ne touche à la commande que si elle attend encore un paiement
    // (jamais une commande annulée ou déjà livrée).
    if (
      order &&
      (order.status === "PENDING_PAYMENT" || order.status === "PARTIALLY_PAID")
    ) {
      const paidPayments = await tx.payment.findMany({
        where: { orderId: payment.orderId, status: "PAID" },
        select: { amount: true },
      });

      const paidCents = paidPayments.reduce(
        (sum, p) => sum + toCents(p.amount.toString()),
        0
      );

      // PAID seulement si la somme des paiements couvre le total de la commande.
      const newStatus =
        paidCents >= toCents(order.totalAmount.toString())
          ? "PAID"
          : "PARTIALLY_PAID";

      await tx.order.update({
        where: { id: payment.orderId },
        data: { status: newStatus },
      });

      // Premier événement du suivi, créé une seule fois : on n'arrive ici
      // que lorsque la commande passe réellement à PAID.
      if (newStatus === "PAID") {
        await tx.trackingEvent.create({
          data: {
            orderId: payment.orderId,
            status: "ORDER_VALIDATED",
            message: "Paiement reçu : commande validée",
          },
        });
      }
      

    } else {
      console.error(
        `ALERTE PAIEMENT : paiement ${payment.id} reçu pour une commande au statut ${order?.status}`
      );
    }

    return "PAID" as const;
  });

  return { outcome, paymentId: payment.id };
}