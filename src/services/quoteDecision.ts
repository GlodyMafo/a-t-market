import { Prisma } from "../../generated/prisma/client";

export type QuoteDecision = {
  status: "AUTO_APPROVED" | "PENDING_REVIEW";
  reason: "UNKNOWN_WEIGHT" | "ABOVE_LIMIT" | null;
};

type Amount = Prisma.Decimal | string | number;

export function decideQuoteStatus(input: {
  isProvisional: boolean;
  totalPrice: Amount;
  autoApproveMaxUsd: Amount | null | undefined;
}): QuoteDecision {
  if (input.isProvisional) return { status: "PENDING_REVIEW", reason: "UNKNOWN_WEIGHT" };

  if (input.autoApproveMaxUsd !== null && input.autoApproveMaxUsd !== undefined) {
    const cap = new Prisma.Decimal(input.autoApproveMaxUsd);
    if (cap.gt(0) && new Prisma.Decimal(input.totalPrice).gt(cap)) {
      return { status: "PENDING_REVIEW", reason: "ABOVE_LIMIT" };
    }
  }
  return { status: "AUTO_APPROVED", reason: null };
}

export const REVIEW_NOTICE: Record<NonNullable<QuoteDecision["reason"]>, string> = {
  UNKNOWN_WEIGHT: "Le poids de ce produit est inconnu : le transport sera confirmé par notre équipe avant le paiement.",
  ABOVE_LIMIT: "Ce montant est vérifié par notre équipe avant le paiement.",
};