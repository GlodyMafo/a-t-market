import { prisma } from "../lib/prisma";

export async function createPayment(
  orderId: string
) {

  const order =
    await prisma.order.findUnique({

      where: {
        id: orderId
      }

    });

  if (!order) {

    throw new Error(
      "Commande introuvable"
    );

  }

  const existingPayment =
    await prisma.payment.findUnique({

      where: {
        orderId
      }

    });

  if (existingPayment) {

    throw new Error(
      "Un paiement existe déjà pour cette commande"
    );

  }

  const payment =
    await prisma.payment.create({

      data: {

        orderId,

        amount: order.totalAmount,

        status: "PENDING"

      }

    });

  return payment;

}