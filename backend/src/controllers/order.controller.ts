import { Request, Response } from "express";

import {
  createOrderFromCart,
  getOrdersByUser,
  getOrderById
} from "../services/order.service";

import { AuthRequest }
  from "../middlewares/auth.middleware";

// Create order

export async function createOrderController(
  req: AuthRequest,
  res: Response
) {

  try {

    const order =
      await createOrderFromCart(

        req.user!.userId

      );

    return res.status(201).json({

      success: true,

      data: order

    });

  } catch(error:any){

    return res.status(400).json({

      success:false,

      message:error.message

    });

  }

}



// Get user orders

export async function getOrdersByUserController(
  req: AuthRequest,
  res: Response
) {

  try {

    const orders =
      await getOrdersByUser(

        req.user!.userId

      );

    return res.json({

      success:true,

      data:orders

    });

  } catch(error:any){

    return res.status(400).json({

      success:false,

      message:error.message

    });

  }

}

export async function getOrderByIdController(
  req: AuthRequest,
  res: Response
) {

  try {

    const order =
      await getOrderById(

        req.params.id,

        req.user!.userId

      );

    return res.json({

      success:true,

      data:order

    });

  } catch(error:any){

    return res.status(404).json({

      success:false,

      message:error.message

    });

  }

}
