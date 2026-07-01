import { prisma } from "../lib/prisma";
import { getDepositStatus } from "./pawapay.status.service";


export async function reconcilePendingPayments() {


    const payments =
        await prisma.payment.findMany({

            where: {

                status: "PENDING"

            }

        });



    console.log(
        "PENDING PAYMENTS:",
        payments.length
    );



    for (const payment of payments) {


        try {


            /**
             * 1. Expiration automatique après 24h
             */

            const expirationLimit =
                new Date(
                    Date.now() - 24 * 60 * 60 * 1000
                );



            if(payment.createdAt < expirationLimit){


                await prisma.payment.update({

                    where:{
                        id: payment.id
                    },

                    data:{

                        status:"EXPIRED"

                    }

                });



                console.log(
                    "PAYMENT EXPIRED:",
                    payment.id
                );


                continue;

            }




            /**
             * 2. Vérification provider reference
             */


            if (!payment.providerReference) {


                console.log(
                    "PAYMENT WITHOUT PROVIDER REFERENCE:",
                    payment.id
                );


                continue;

            }




            /**
             * 3. Vérification PawaPay
             */


            const status =
                await getDepositStatus(

                    payment.providerReference

                );



            if (status.status === "NOT_FOUND") {


                console.log(

                    "Deposit introuvable chez PawaPay:",
                    payment.providerReference

                );


                continue;

            }




            console.log(

                "DEPOSIT STATUS:",
                status

            );





            /**
             * 4. Paiement réussi
             */


            if(status.data?.status === "COMPLETED"){



                await prisma.$transaction(async(tx)=>{


                    await tx.payment.update({

                        where:{
                            id:payment.id
                        },

                        data:{

                            status:"PAID"

                        }

                    });



                    await tx.order.update({

                        where:{
                            id:payment.orderId
                        },

                        data:{

                            status:"PAID"

                        }

                    });



                });



                console.log(

                    "PAYMENT RECOVERED:",
                    payment.id

                );


            }





            /**
             * 5. Paiement échoué
             */


            if(status.data?.status === "FAILED"){



                await prisma.payment.update({

                    where:{
                        id:payment.id
                    },

                    data:{

                        status:"FAILED"

                    }

                });



                console.log(

                    "PAYMENT FAILED:",
                    payment.id

                );


            }



        }
        catch(error:any){


            console.error(

                "RECONCILIATION ERROR:",
                error.message

            );


        }


    }


}