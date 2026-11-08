import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import {
  settlePaymentByDepositId,
  SettlementResult,
} from "./payment.settlement.service";

/**
 * Un callback PawaPay n'est qu'un SIGNAL ("va vérifier ce dépôt").
 * Son contenu (statut, montant…) n'est jamais utilisé pour décider : seule la
 * réponse de PawaPay à notre propre requête authentifiée fait foi.
 */
export async function handlePawapayCallback(
  payload: { depositId: string } & Record<string, unknown>
): Promise<SettlementResult> {
  const log = await prisma.paymentWebhookLog.create({
    data: {
      depositId: payload.depositId,
      status: typeof payload.status === "string" ? payload.status : "UNKNOWN",
      payload: payload as Prisma.InputJsonValue,
    },
  });

  try {
    const result = await settlePaymentByDepositId(payload.depositId);

    await prisma.paymentWebhookLog.update({
      where: { id: log.id },
      data: {
        processed: true,
        paymentId: result.paymentId,
        error:
          result.outcome === "VERIFICATION_FAILED" ||
          result.outcome === "UNKNOWN_PAYMENT"
            ? (result.reason ?? result.outcome)
            : null,
      },
    });

    return result;
  } catch (error: any) {
    await prisma.paymentWebhookLog.update({
      where: { id: log.id },
      data: { error: error.message },
    });
    throw error;
  }
}