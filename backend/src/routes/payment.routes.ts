import { Router } from "express";

import {
  createPaymentController
} from "../controllers/payment.controller";

const router = Router();

router.post(

  "/create",

  createPaymentController

);

export default router;