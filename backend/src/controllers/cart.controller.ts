import { Request, Response } from "express";
import { addToCart,  getCartByUser } from "../services/cart.service";

export async function addToCartController(
  req: Request,
  res: Response
) {

  try {

    const cartItem =
      await addToCart(req.body);

    return res.status(201).json({
      success: true,
      data: cartItem
    });

  } catch (error: any) {

    return res.status(400).json({
      success: false,
      message: error.message
    });

  }

}

// Get cart by user

export async function getCartController(
  req: Request,
  res: Response
) {

  try {

    const { userId } = req.params;


    const cart =
      await getCartByUser(userId);


    return res.json({
      success: true,
      data: cart
    });


  } catch (error: any) {

    return res.status(404).json({
      success: false,
      message: error.message
    });

  }

}

