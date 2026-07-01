import { z } from "zod";


export const pawapayWebhookSchema = z.object({

    depositId:
        z.string().uuid(),


    status:
        z.enum([
            "ACCEPTED",
            "COMPLETED",
            "FAILED",
            "REJECTED"
        ]),


    amount:
        z.string(),


    currency:
        z.string(),


    metadata:
        z.object({

            orderId:
                z.string()

        })

}).passthrough();