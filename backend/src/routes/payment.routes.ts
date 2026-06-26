import { Router } from "express";

import {
  createPaymentController,
  confirmPaymentController
} from "../controllers/payment.controller";

const router = Router();

router.post(

  "/create",

  createPaymentController

);

router.post(

  "/:paymentId/confirm",

  confirmPaymentController

);

export default router;

