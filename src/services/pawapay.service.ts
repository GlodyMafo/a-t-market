import { env } from "../config/env";

import {
    CreateDepositRequest,
    CreateDepositResponse
} from "../types/pawapay";

/** Erreur dont le message peut être montré tel quel au client (saisie invalide, paiement refusé). */
export class PaymentUserError extends Error {}


function normalizePhone(phone: string) {

    return phone
        .replace(/\D/g, "") // enlève espaces, +, tirets...
        .replace(/^0/, "243"); // remplace le 0 initial par indicatif RDC

}

function normalizeProvider(provider: string) {

    const providers: Record<string, string> = {

        AIRTEL: "AIRTEL_COD",

        MTN: "MTN_MOMO_COD",

        ORANGE: "ORANGE_COD",

        VODACOM: "VODACOM_MPESA"

    };


    const normalized =
        providers[
        provider.toUpperCase()
        ];


    if (!normalized) {

        throw new PaymentUserError("Provider Mobile Money non supporté");

    }


    return normalized;

}


export async function createDeposit(

    data: CreateDepositRequest

): Promise<CreateDepositResponse> {


    const payload = {

        depositId:
            data.depositId,


        amount:
            data.amount,


        currency:
            data.currency,


        payer: {

            type:
                "MMO",


            accountDetails: {

                phoneNumber:
                    normalizePhone(data.phoneNumber),


                provider:
                    normalizeProvider(data.provider)

            }

        },


        customerMessage:
            (data.customerMessage ?? "Paiement AT Market")
                .replace(/[^a-zA-Z0-9 ]/g, ""),


        metadata: [

            {

                orderId:
                    data.orderId

            }

        ]

    };



    try {



        const response = await fetch(

            `${env.PAWAPAY_BASE_URL}/v2/deposits`,

            {

                method: "POST",


                headers: {


                    Authorization:
                        `Bearer ${env.PAWAPAY_API_KEY}`,


                    "Content-Type":
                        "application/json"

                },


                body:
                    JSON.stringify(payload)

            }

        );

        const responseText =
            await response.text();

        if (!response.ok) {


            throw new Error(`PawaPay HTTP ${response.status}`);

        }

        const result:
            CreateDepositResponse =
            JSON.parse(responseText);

        return result;

    } catch (error: any) {


        console.error("PAWAPAY ERROR:", error?.message);


        throw new Error(

            error.message ??
            "Erreur communication PawaPay"

        );

    }

}