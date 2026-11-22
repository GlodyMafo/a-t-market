
import { Response } from "express";
import { z } from "zod";
import { safeMessage } from "../utils/appError";

import {
  createOrderFromCart,
  getOrdersByUser,
  getOrderById,
  countOrdersByUser,
} from "../services/order.service";

import { toPublicOrder } from "../services/orderPublic";
import { AuthRequest } from "../middlewares/auth.middleware";
import { parsePagination, pageMeta } from "../utils/pagination";

const createOrderBody = z
  .object({
    addressId: z
      .string({ error: "Choisissez une adresse de livraison." })
      .min(1, "Choisissez une adresse de livraison.")
      .max(100),
  })
  .strict();

// Create order
export async function createOrderController(
  req: AuthRequest,
  res: Response
) {
  try {
    const { addressId } = createOrderBody.parse(req.body);
    const order = await createOrderFromCart(
      req.user!.userId,
      addressId
    );

    return res.status(201).json({
      success: true,
      data: toPublicOrder(order),
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: safeMessage(error),
    });
  }
}

// Get user orders
export async function getOrdersByUserController(
  req: AuthRequest,
  res: Response
) {
  try {
    const userId = req.user!.userId;
    const { page, limit, paging } = parsePagination(req.query);

    const [data, total] = await Promise.all([
      getOrdersByUser(userId, paging),
      countOrdersByUser(userId),
    ]);

    return res.json({
      success: true,
      data: data.map(toPublicOrder),
      meta: pageMeta(total, page, limit),
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: safeMessage(error),
    });
  }
}

// Get order by ID
export async function getOrderByIdController(
  req: AuthRequest,
  res: Response
) {
  try {
    const order = await getOrderById(
      req.params.id as string,
      req.user!.userId
    );

    return res.json({
      success: true,
      data: toPublicOrder(order),
    });
  } catch (error: any) {
    return res.status(404).json({
      success: false,
      message: safeMessage(error),
    });
  }
}
