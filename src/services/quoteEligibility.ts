import { Prisma } from "../../generated/prisma/client";
import { isQuoteExpired, isQuotePayable } from "./internationalQuote.service";

export type QuoteIssue =
  | "PENDING_REVIEW" // en attente de validation par l'équipe (règle D : impayable)
  | "REJECTED"
  | "EXPIRED"
  | "ALREADY_ORDERED"; // déjà dans une commande non annulée

/**
 * Pourquoi un devis ne peut (pas encore) être payé. null = il est payable.
 * Règle D : un devis provisoire (PENDING_REVIEW) n'est JAMAIS payable.
 */
export function quoteIssue(
  quote: { status: string; expiresAt: Date | null; createdAt: Date },
  alreadyOrdered: boolean,
  now: Date = new Date()
): QuoteIssue | null {
  if (quote.status === "REJECTED") return "REJECTED";
  if (alreadyOrdered) return "ALREADY_ORDERED";
  if (!isQuotePayable(quote.status)) return "PENDING_REVIEW";
  if (isQuoteExpired(quote, now)) return "EXPIRED";
  return null;
}

export function quoteIssueMessage(issue: QuoteIssue, name: string | null): string {
  const productName = name?.trim() || "produit international";

  switch (issue) {
    case "PENDING_REVIEW":
      return `Le devis « ${productName} » est en attente de validation par notre équipe : il ne peut pas encore être payé.`;
    case "REJECTED":
      return `Le devis « ${productName} » a été rejeté.`;
    case "EXPIRED":
      return `Le devis « ${productName} » a expiré : refaites un devis pour obtenir un prix à jour.`;
    case "ALREADY_ORDERED":
      return `Le devis « ${productName} » est déjà dans une commande.`;
  }
}

/** Devis (parmi ceux donnés) qui figurent déjà dans une commande NON annulée. */
export async function activeOrderQuoteIds(
  client: Pick<Prisma.TransactionClient, "orderItem">,
  quoteIds: string[]
): Promise<Set<string>> {
  if (quoteIds.length === 0) return new Set();

  const rows = await client.orderItem.findMany({
    where: {
      quoteId: { in: quoteIds },
      order: { status: { not: "CANCELLED" } },
    },
    select: { quoteId: true },
  });

  return new Set(rows.map((r) => r.quoteId as string));
}