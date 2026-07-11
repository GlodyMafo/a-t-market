import { z } from "zod";


export const createPaymentSchema = z.object({

    orderId: z.string()
        .min(1, "OrderId obligatoire"),


    paymentType: z.enum([
        "PRODUCT",
        "SHIPPING",
        "FULL"
    ]),


    phoneNumber: z.string()
        .min(9, "Numéro invalide"),


    provider: z.string()
        .min(1, "Provider obligatoire")

});