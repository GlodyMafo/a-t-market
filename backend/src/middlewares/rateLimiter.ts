import rateLimit from "express-rate-limit";


export const webhookRateLimiter = rateLimit({

    windowMs:
        60 * 1000, // 1 minute


    max:
        5, // 20 requêtes max par minute


    message: {

        success:false,

        message:
            "Too many webhook requests"

    },


    standardHeaders:
        true,


    legacyHeaders:
        false

});