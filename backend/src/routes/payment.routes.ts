import { Router } from "express";

import {
 createPaymentController,
 confirmPaymentController
} from "../controllers/payment.controller";

import {
 pawapayCallbackController
} from "../controllers/pawapay.callback.controller";

import {
 webhookRateLimiter
}
from "../middlewares/rateLimiter";


import {
 authMiddleware
}
from "../middlewares/auth.middleware";


const router = Router();


router.post(
 "/",
 authMiddleware,
 createPaymentController
);


/**
 * DEV ONLY
 * En production seul le webhook PawaPay
 * doit confirmer le paiement.
 */

router.post(
 "/confirm/:paymentId",
 confirmPaymentController
);


router.post(

    "/pawapay/callback",

    webhookRateLimiter,

    pawapayCallbackController

);


export default router;