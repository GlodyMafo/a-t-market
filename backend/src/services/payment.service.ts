import { prisma } from "../lib/prisma";
import { randomUUID } from "crypto";
import { createDeposit } from "./pawapay.service";


async function decrementOrderInventory(
    tx: any,
    orderId: string
) {

    const order =
        await tx.order.findUnique({

            where: {
                id: orderId
            },

            include: {
                items: true
            }

        });

    if (!order) {
        return;
    }

    for (const item of order.items) {

        const inventory =
            await tx.inventory.findUnique({

                where: {
                    productId: item.productId
                }

            });

        if (!inventory) {
            continue;
        }

        const newQuantity =
            inventory.quantity - item.quantity;

        await tx.inventory.update({

            where: {
                productId: item.productId
            },

            data: {

                quantity:
                    Math.max(
                        0,
                        newQuantity
                    )

            }

        });

    }

}

export async function createPayment(

    orderId: string,

    userId: string,

    phoneNumber: string,

    provider: string,

    paymentType:
        "PRODUCT" | "SHIPPING" | "FULL"

) {

    const depositId = randomUUID();


    const order =
        await prisma.order.findFirst({

            where: {

                id: orderId,

                userId

            }

        });


    if (!order) {

        throw new Error(
            "Commande introuvable"
        );

    }


    const existingPayment =
        await prisma.payment.findFirst({

            where: {

                orderId,

                type: paymentType,

                status: {

                    in: ["PAID", "PENDING"]

                }

            }

        });


    if (existingPayment) {

        throw new Error(

            `Le paiement ${paymentType} existe déjà`

        );

    }


    let amount = 0;


    switch (paymentType) {

        case "PRODUCT":

            amount =
                Number(order.productsAmount);

            break;


        case "SHIPPING":

            amount =
                Number(order.shippingAmount);

            break;


        case "FULL":

            amount =
                Number(order.totalAmount);

            break;


        default:

            throw new Error(
                "Type de paiement invalide"
            );

    }


    const payment =
        await prisma.payment.create({

            data: {

                orderId,

                amount,

                type: paymentType,

                status: "PENDING"

            }

        });


    let pawapayResponse;


    try {

        pawapayResponse =
            await createDeposit({

                depositId,

                amount:
                    payment.amount.toString(),

                currency: "USD",

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

                id: payment.id

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

                const paidPayments =
                    await tx.payment.findMany({

                        where: {
                            orderId: payment.orderId,
                            status: "PAID"
                        }

                    });

                const hasFullPayment =
                    paidPayments.some(
                        p => p.type === "FULL"
                    );

                const hasProductPayment =
                    paidPayments.some(
                        p => p.type === "PRODUCT"
                    );

                const hasShippingPayment =
                    paidPayments.some(
                        p => p.type === "SHIPPING"
                    );

                let orderStatus: any =
                    "PENDING_PAYMENT";

                if (
                    hasFullPayment ||
                    (
                        hasProductPayment &&
                        hasShippingPayment
                    )
                ) {

                    orderStatus = "PAID";

                }

                else if (
                    hasProductPayment
                ) {

                    orderStatus =
                        "PARTIALLY_PAID";

                }

                await tx.order.update({

                    where: {
                        id: payment.orderId
                    },

                    data: {
                        status: orderStatus
                    }

                });

                await decrementOrderInventory(
                    tx,
                    payment.orderId
                );

                return updatedPayment;

            }

        );

    return result;

}

export async function handlePawapayCallback(
    depositId: string,
    status: string
) {

    const payment =
        await prisma.payment.findFirst({

            where: {
                providerReference: depositId
            }

        });

    if (!payment) {

        throw new Error(
            "Paiement PawaPay introuvable"
        );

    }

    if (status !== "COMPLETED") {

        await prisma.payment.update({

            where: {
                id: payment.id
            },

            data: {
                status: "FAILED"
            }

        });

        return payment;

    }

    const result =
        await prisma.$transaction(

            async (tx) => {

                const updatedPayment =
                    await tx.payment.update({

                        where: {
                            id: payment.id
                        },

                        data: {
                            status: "PAID"
                        }

                    });

                const paidPayments =
                    await tx.payment.findMany({

                        where: {
                            orderId: payment.orderId,
                            status: "PAID"
                        }

                    });

                const hasFullPayment =
                    paidPayments.some(
                        p => p.type === "FULL"
                    );

                const hasProductPayment =
                    paidPayments.some(
                        p => p.type === "PRODUCT"
                    );

                const hasShippingPayment =
                    paidPayments.some(
                        p => p.type === "SHIPPING"
                    );

                let orderStatus: any =
                    "PENDING_PAYMENT";

                if (
                    hasFullPayment ||
                    (
                        hasProductPayment &&
                        hasShippingPayment
                    )
                ) {

                    orderStatus = "PAID";

                }

                else if (
                    hasProductPayment
                ) {

                    orderStatus =
                        "PARTIALLY_PAID";

                }

                await tx.order.update({

                    where: {
                        id: payment.orderId
                    },

                    data: {
                        status: orderStatus
                    }

                });
                

                await decrementOrderInventory(
                    tx,
                    payment.orderId
                );

                return updatedPayment;

            }

        );

    return result;

}