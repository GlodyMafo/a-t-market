import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../lib/prisma";
import { computeQuote, normalizeWeightKg } from "./pricing.service";
import { activeOrderQuoteIds } from "./quoteEligibility";
import { QuoteRow, quoteSnapshot as snapshotOf } from "./quoteSnapshot";
import { quoteValidUntil } from "./internationalQuote.service";



type Tx = Prisma.TransactionClient;

export class QuoteNotFoundError extends Error {
  constructor() {
    super("Devis introuvable");
    this.name = "QuoteNotFoundError";
  }
}


/** Verrouille le devis : deux décisions admin simultanées passent l'une après l'autre. */
async function lockQuote(tx: Tx, quoteId: string): Promise<QuoteRow> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "InternationalQuote" WHERE id = ${quoteId} FOR UPDATE
  `;

  if (rows.length === 0) {
    throw new QuoteNotFoundError();
  }

  return tx.internationalQuote.findUniqueOrThrow({ where: { id: quoteId } });
}

export async function getPendingQuotes() {
  return prisma.internationalQuote.findMany({
    where: {
      status: "PENDING_REVIEW",
    },
    include: {
      user: {
        select: { id: true, email: true, phone: true },
      },
      subCategory: {
        include: {
          category: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export interface ApproveQuoteInput {
  /** Poids réel renseigné par l'admin (kg, 2 décimales maximum). */
  weightKg?: number;
  adminNotes?: string;
}

/**
 * Approuve un devis en attente. L'admin peut renseigner le poids (obligatoire si le devis
 * n'en a pas). Le montant définitif est recalculé avec les réglages ACTUELS ; le devis
 * provisoire d'origine reste intact dans l'historique (QuoteRevision).
 */


export async function approveQuote(
  quoteId: string,
  adminId: string,
  input: ApproveQuoteInput = {}
) {
  return prisma.$transaction(async (tx) => {
    const quote = await lockQuote(tx, quoteId);

    if (quote.status !== "PENDING_REVIEW") {
      throw new Error(
        "Seuls les devis en attente de validation peuvent être approuvés."
      );
    }

    const settings = await tx.globalSettings.findFirst();
    if (!settings) {
      throw new Error("Configuration système introuvable");
    }

    const adminProvidedWeight =
      input.weightKg !== undefined && input.weightKg !== null;

    if (adminProvidedWeight && new Prisma.Decimal(input.weightKg!).decimalPlaces() > 2) {
      throw new Error("Le poids doit avoir au maximum 2 décimales (précision de 10 g).");
    }

    const weight = adminProvidedWeight
      ? normalizeWeightKg(input.weightKg!)
      : quote.productWeight !== null
        ? normalizeWeightKg(quote.productWeight)
        : null;

    if (weight === null) {
      throw new Error(
        "Impossible d'approuver ce devis : renseignez le poids du produit (weightKg)."
      );
    }

    const breakdown = computeQuote({
      productPrice: quote.productPrice,
      weightKg: weight,
      settings,
    });

    const updated = await tx.internationalQuote.update({
      where: { id: quoteId },
      data: {
        status: "APPROVED",
        productWeight: weight,
        weightSource: adminProvidedWeight ? "ADMIN" : quote.weightSource,
        shippingCost: breakdown.shippingCost,
        customsCost: breakdown.customsCost,
        commissionCost: breakdown.commissionCost,
        totalPrice: breakdown.totalPrice,
        commissionRate: settings.commissionRate,
        chinaPricePerKg: settings.chinaPricePerKg,
        fixedFee: settings.fixedFee,
        adminNotes: input.adminNotes ?? null,
        expiresAt: quoteValidUntil(),
      },
    });

    await tx.quoteRevision.create({
      data: {
        quoteId,
        adminId,
        action: "APPROVED",
        note: input.adminNotes ?? null,
        snapshotBefore: snapshotOf(quote),
        snapshotAfter: snapshotOf(updated),
      },
    });

    return updated;
  });
}

/**
 * Rejette un devis. Possible seulement tant qu'il est en attente ou validé automatiquement :
 * un devis déjà approuvé ou déjà rejeté ne change plus de statut.
 * Un motif est obligatoire (il est visible par le client et conservé dans l'historique).
 */
export async function rejectQuote(
  quoteId: string,
  adminId: string,
  adminNotes: string
) {
  const note = typeof adminNotes === "string" ? adminNotes.trim() : "";

  if (note.length < 3 || note.length > 500) {
    throw new Error("Un motif de rejet (3 à 500 caractères) est obligatoire.");
  }

  return prisma.$transaction(async (tx) => {
    const quote = await lockQuote(tx, quoteId);

    // Un devis déjà dans une commande (non annulée) est figé : le client l'a payé ou va le payer.
    const ordered = await activeOrderQuoteIds(tx, [quoteId]);
    if (ordered.has(quoteId)) {
      throw new Error(
        "Ce devis est déjà utilisé dans une commande : il ne peut plus être rejeté."
      );
    }

    if (quote.status !== "PENDING_REVIEW" && quote.status !== "AUTO_APPROVED") {
      throw new Error(
        "Ce devis ne peut plus être rejeté : il est déjà approuvé ou rejeté."
      );
    }

    const updated = await tx.internationalQuote.update({
      where: { id: quoteId },
      data: { status: "REJECTED", adminNotes: note },
    });

    await tx.quoteRevision.create({
      data: {
        quoteId,
        adminId,
        action: "REJECTED",
        note,
        snapshotBefore: snapshotOf(quote),
        snapshotAfter: snapshotOf(updated),
      },
    });

    return updated;
  });
}

/** Historique complet des décisions admin sur un devis, du plus ancien au plus récent. */
export async function getQuoteHistory(quoteId: string) {
  const quote = await prisma.internationalQuote.findUnique({
    where: { id: quoteId },
    select: { id: true },
  });

  if (!quote) {
    throw new QuoteNotFoundError();
  }

  return prisma.quoteRevision.findMany({
    where: { quoteId },
    include: {
      admin: { select: { id: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}