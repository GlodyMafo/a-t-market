import { safeMessage } from "../utils/appError";
import { Request, Response } from "express";

import {
  createOrderFromCart,
  getOrdersByUser,
  getOrderById,
  countOrdersByUser
} from "../services/order.service";

import { AuthRequest }
  from "../middlewares/auth.middleware";

import { parsePagination, pageMeta } from "../utils/pagination"

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

      message: safeMessage(error)

    });

  }

}



// Get user orders
export async function getOrdersByUserController(req: AuthRequest, res: Response) {
  try {
    const userId = req.user!.userId;
    const { page, limit, paging } = parsePagination(req.query);
    const [data, total] = await Promise.all([
      getOrdersByUser(userId, paging),
      countOrdersByUser(userId),
    ]);
    return res.json({ success: true, data, meta: pageMeta(total, page, limit) });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: safeMessage(error) });
  }
}

export async function getOrderByIdController(
  req: AuthRequest,
  res: Response
) {

  try {

    const order =
      await getOrderById(

        (req.params.id as string),

        req.user!.userId

      );

    return res.json({

      success:true,

      data:order

    });

  } catch(error:any){

    return res.status(404).json({

      success:false,

      message: safeMessage(error)

    });

  }

}
