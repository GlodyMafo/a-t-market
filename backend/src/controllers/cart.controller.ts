import { Request, Response } from "express";
import { addToCart,  getCartByUser, updateCartItemQuantity,removeCartItem } from "../services/cart.service";

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

// Update quantity

export async function updateCartItemController(
  req: Request,
  res: Response
) {

  try {

    const { id } = req.params;

    const { quantity } = req.body;


    const item =
      await updateCartItemQuantity(
        id,
        quantity
      );


    return res.json({
      success:true,
      data:item
    });


  } catch(error:any) {


    return res.status(400).json({
      success:false,
      message:error.message
    });


  }

}


//Delete cart 

export async function removeCartItemController(
  req: Request,
  res: Response
){

  try{

    const { id } = req.params;


    const result =
      await removeCartItem(id);


    return res.json({
      success:true,
      data:result
    });


  }catch(error:any){


    return res.status(400).json({
      success:false,
      message:error.message
    });


  }

}

