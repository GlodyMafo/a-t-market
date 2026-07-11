import { Request, Response } from "express";

import {
  createPayment,
  confirmPayment,
  handlePawapayCallback
} from "../services/payment.service";

import {
  createPaymentSchema
}
  from "../validators/payment.validator";


export async function createPaymentController(
  req: Request,
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
      message: error.message
    });

  }

}

export async function confirmPaymentController(
  req: Request,
  res: Response
) {

  try {

    const { paymentId } = req.params;

    const payment =
      await confirmPayment(paymentId);

    return res.status(200).json({
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


export async function pawapayCallbackController(
  req: Request,
  res: Response
) {

  try {

    console.log(
      "===== PAWAPAY CALLBACK ====="
    );


    console.log(
      req.body
    );


    return res.status(200).json({

      success: true

    });


  } catch (error: any) {


    console.error(error);


    return res.status(400).json({

      success: false,

      message:
        "Webhook processing failed"

    });

  }

}