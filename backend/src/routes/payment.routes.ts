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


const router = Router();


router.post(
 "/",
 createPaymentController
);


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