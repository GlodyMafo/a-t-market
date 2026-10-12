import { Router } from "express";

import {
 createPaymentController
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

router.post(

    "/pawapay/callback",

    webhookRateLimiter,

    pawapayCallbackController

);


export default router;