import { prisma } from "../lib/prisma";
import { randomUUID } from "crypto";
import { createDeposit } from "./pawapay.service";



export async function createPayment(

    orderId: string,

    phoneNumber: string,

    provider: string

) {


    const depositId = randomUUID();



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


    const paidPayment =
        await prisma.payment.findFirst({

            where: {

                orderId,

                status: "PAID"

            }

        });



    if (paidPayment) {

        throw new Error(
            "Cette commande est déjà payée"
        );

    }



    const payment =
        await prisma.payment.create({

            data: {

                orderId,

                amount:
                    order.totalAmount,

                status:
                    "PENDING"

            }

        });



    let pawapayResponse;


    try {


        pawapayResponse =
            await createDeposit({

                depositId,

                amount:
                    payment.amount.toString(),

                currency:
                    "USD",

                phoneNumber,

                provider,

                customerMessage:
                    "Paiement A&T Market",

                orderId

            });


    } catch (error: any) {


        await prisma.payment.update({

            where: {

                id: payment.id

            },

            data: {

                status: "FAILED"

            }

        });


        throw new Error(

            error.message ||
            "Paiement PawaPay échoué"

        );


    }



    const updatedPayment =
        await prisma.payment.update({

            where: {

                id:
                    payment.id

            },


            data: {

                providerReference:
                    pawapayResponse.depositId

            }

        });



    return updatedPayment;


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

export async function handlePawapayCallback(

    depositId:string,

    status:string

) {


    const payment =
        await prisma.payment.findFirst({

            where: {

                providerReference:
                    depositId

            }

        });


    if(!payment){

        throw new Error(
            "Paiement PawaPay introuvable"
        );

    }



    if(status !== "COMPLETED"){

        await prisma.payment.update({

            where:{

                id:
                    payment.id

            },

            data:{

                status:"FAILED"

            }

        });


        return payment;

    }



    const result =
        await prisma.$transaction(

            async(tx)=>{


                const updatedPayment =
                    await tx.payment.update({

                        where:{

                            id:
                                payment.id

                        },

                        data:{

                            status:"PAID"

                        }

                    });



                await tx.order.update({

                    where:{

                        id:
                            payment.orderId

                    },

                    data:{

                        status:"PAID"

                    }

                });



                return updatedPayment;


            }

        );



    return result;


}