import { Request, Response } from "express";

import {
  createPayment
} from "../services/payment.service";

export async function createPaymentController(

  req: Request,

  res: Response

) {

  try {

    const {
      orderId
    } = req.body;

    const payment =
      await createPayment(
        orderId
      );

    return res.status(201).json({

      success: true,

      data: payment

    });

  } catch (error: any) {

    return res.status(400).json({

      success: false,

      message: error.message

    });

  }

}