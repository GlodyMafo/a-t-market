import { prisma } from "../lib/prisma";


export async function handlePawapayCallback(data: any) {

    const {
        depositId,
        status,
        amount,
        currency,
        metadata
    } = data;


    console.log("PROCESS CALLBACK:", data);


    let webhookLog;


    try {


        // 1. Logger immédiatement le webhook reçu

        webhookLog = await prisma.paymentWebhookLog.create({

            data: {

                depositId,

                status,

                payload: data

            }

        });



        const payment = await prisma.payment.findFirst({

            where: {

                providerReference: depositId

            },

            include: {

                order: true

            }

        });



        if (!payment) {

            throw new Error(
                "Paiement introuvable"
            );

        }



        // Protection double traitement

        if (payment.status === "PAID") {


            await prisma.paymentWebhookLog.update({

                where: {

                    id: webhookLog.id

                },

                data: {

                    processed: true,

                    paymentId: payment.id

                }

            });


            console.log(
                "Paiement déjà traité"
            );


            return payment;

        }




        // Vérification montant

        if (
            Number(amount) !== Number(payment.amount)
        ) {


            throw new Error(
                "Montant du paiement invalide"
            );

        }




        // Vérification devise

        if (
            currency !== "USD"
        ) {


            throw new Error(
                "Devise invalide"
            );

        }




        // Vérification commande

        if (
            metadata?.orderId !== payment.orderId
        ) {


            throw new Error(
                "Commande invalide"
            );

        }




        // Paiement refusé

        if (
            status !== "COMPLETED"
        ) {


            await prisma.payment.update({

                where: {

                    id: payment.id

                },

                data: {

                    status: "FAILED"

                }

            });



            await prisma.paymentWebhookLog.update({

                where: {

                    id: webhookLog.id

                },

                data: {

                    processed:true,

                    paymentId:payment.id

                }

            });



            return payment;

        }




        // Succès paiement

        const result = await prisma.$transaction(async(tx)=>{


            const updatedPayment =
                await tx.payment.update({

                where: {

                    id: payment.id

                },

                data: {

                    status:"PAID"

                }

            });



            await tx.order.update({

                where: {

                    id: payment.orderId

                },

                data: {

                    status:"PAID"

                }

            });



            return updatedPayment;


        });




        await prisma.paymentWebhookLog.update({

            where: {

                id:webhookLog.id

            },

            data: {

                processed:true,

                paymentId:result.id

            }

        });



        console.log(
            "CALLBACK SUCCESS"
        );



        return result;



    } catch(error:any){



        console.error(
            "CALLBACK ERROR:",
            error.message
        );



        if(webhookLog){


            await prisma.paymentWebhookLog.update({

                where:{

                    id:webhookLog.id

                },

                data:{

                    error:error.message

                }

            });

        }



        throw error;


    }


}