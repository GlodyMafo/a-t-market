import { Request, Response } from "express";

import { handlePawapayCallback }
    from "../services/pawapay.callback.service";

import { env }
    from "../config/env";

import {
    pawapayWebhookSchema
}
    from "../validators/pawapay.validator";



export async function pawapayCallbackController(

    req: Request,

    res: Response

) {


    try {


        // 1. Vérification sécurité webhook

        const webhookSecret =
            req.headers["x-webhook-secret"];



        if (
            webhookSecret !== env.PAWAPAY_WEBHOOK_SECRET
        ) {


            console.warn(
                "PAWAPAY WEBHOOK BLOCKED: Invalid secret"
            );


            return res.status(401).json({

                success: false,

                message: "Unauthorized webhook"

            });

        }



        // 2. Vérification payload

        if (
            !req.body ||
            Object.keys(req.body).length === 0
        ) {


            return res.status(400).json({

                success: false,

                message: "Empty webhook payload"

            });

        }



        console.log(
            "PAWAPAY CALLBACK RECEIVED:",
            req.body
        );



        const validatedData =
            pawapayWebhookSchema.parse(
                req.body
            );


        // 3. Traitement métier

        const payment =
            await handlePawapayCallback(

               validatedData

            );




        return res.status(200).json({

            success: true,

            data: payment

        });




    } catch (error: any) {



        console.error(

            "PAWAPAY CALLBACK ERROR:",

            error.message

        );



        return res.status(400).json({

            success: false,

            message:
                error.message ??
                "Webhook processing failed"

        });


    }

}