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

      status: "APPROVED",

      adminNotes

    }

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