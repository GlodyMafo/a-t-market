import { Request, Response } from "express";

import {
  createPayment,
  confirmPayment
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

export async function confirmPaymentController(

  req: Request,

  res: Response

) {

  try {


    const {
      paymentId
    } = req.params;


    const payment =
      await confirmPayment(
        paymentId
      );


    return res.status(200).json({

      success:true,

      data:payment

    });


  } catch(error:any) {


    return res.status(400).json({

      success:false,

      message:error.message

    });


  }

}