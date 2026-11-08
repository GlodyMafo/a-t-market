import { safeMessage } from "../utils/appError";
import { Response } from "express";

import { createPayment } from "../services/payment.service";

import { createPaymentSchema } from "../validators/payment.validator";

import { AuthRequest } from "../middlewares/auth.middleware";

export async function createPaymentController(
  req: AuthRequest,
  res: Response
) {

  try {

    const validatedData =
      createPaymentSchema.parse(
        req.body
      );

    const {
      orderId,
      paymentType,
      phoneNumber,
      provider
    } = validatedData;

    const payment =
      await createPayment(
        orderId,
        req.user!.userId,
        phoneNumber,
        provider,
        paymentType
      );

    return res.status(201).json({
      success: true,
      data: payment
    });

  } catch (error: any) {

    return res.status(400).json({
      success: false,
      message: safeMessage(error)
    });

  }

}

