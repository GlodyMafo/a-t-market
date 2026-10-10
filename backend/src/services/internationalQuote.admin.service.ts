import { prisma } from "../lib/prisma";

export async function getPendingQuotes() {

  return prisma.internationalQuote.findMany({

    where: {

      status: "PENDING_REVIEW"

    },

    include: {

      user: true,

      subCategory: {

        include: {

          category: true

        }

      }

    },

    orderBy: {

      createdAt: "asc"

    }

  });

}



export async function approveQuote(
  quoteId: string,
  adminNotes?: string
) {
  const quote = await prisma.internationalQuote.findUnique({
    where: { id: quoteId },
  });

  if (!quote) {
    throw new Error("Devis introuvable");
  }

  if (quote.status !== "PENDING_REVIEW") {
    throw new Error(
      "Seuls les devis en attente de validation peuvent être approuvés."
    );
  }

  if (
    quote.productWeight === null ||
    Number(quote.productWeight) <= 0
  ) {
    throw new Error(
      "Impossible d'approuver ce devis : le poids du produit doit être déterminé."
    );
  }

  const settings = await prisma.globalSettings.findFirst();

  if (!settings) {
    throw new Error("Configuration système introuvable");
  }

  const shippingCost =
    Number(quote.productWeight) *
    Number(settings.chinaPricePerKg);

  const customsCost = 0;

  const commissionCost =
    Number(quote.productPrice) *
    (Number(settings.commissionRate) / 100);

  const totalPrice =
    Number(quote.productPrice) +
    shippingCost +
    commissionCost +
    customsCost +
    Number(settings.fixedFee);

  return prisma.internationalQuote.update({
    where: { id: quoteId },
    data: {
      shippingCost,
      customsCost,
      commissionCost,
      totalPrice,
      status: "APPROVED",
      adminNotes: adminNotes ?? quote.adminNotes,
    },
  });
}



export async function rejectQuote(
  quoteId: string,
  adminNotes?: string
) {

  const quote =
    await prisma.internationalQuote.findUnique({

      where: {
        id: quoteId
      }

    });

  if (!quote) {

    throw new Error(
      "Devis introuvable"
    );

  }

  return prisma.internationalQuote.update({

    where: {
      id: quoteId
    },

    data: {

      status: "REJECTED",

      adminNotes

    }

  });

}