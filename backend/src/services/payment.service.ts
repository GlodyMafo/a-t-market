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

export async function confirmPayment(
  paymentId: string
) {

  const payment =
    await prisma.payment.findUnique({

      where: {
        id: paymentId
      }

    });


  if (!payment) {

    throw new Error(
      "Paiement introuvable"
    );

  }


  if (payment.status === "PAID") {

    throw new Error(
      "Paiement déjà confirmé"
    );

  }


  const result =
    await prisma.$transaction(

      async (tx) => {


        const updatedPayment =
          await tx.payment.update({

            where: {
              id: paymentId
            },

            data: {

              status: "PAID"

            }

          });


        await tx.order.update({

          where: {

            id: payment.orderId

          },

          data: {

            status: "PAID"

          }

        });


        return updatedPayment;


      }

    );


  return result;

}