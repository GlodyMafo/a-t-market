import { Request, Response } from "express";
import { addToCart,  getCartByUser, updateCartItemQuantity,removeCartItem } from "../services/cart.service";
import { AuthRequest } from "../middlewares/auth.middleware";


export async function addToCartController(

  req: AuthRequest,

  res: Response

) {

  try {

    const cartItem =
      await addToCart({

        userId:
          req.user!.userId,

        productId:
          req.body.productId,

        quantity:
          req.body.quantity

      });

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

  req: AuthRequest,

  res: Response

) {

  try {

    const cart =
      await getCartByUser(

        req.user!.userId

      );

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

  req: AuthRequest,

  res: Response

) {

  try {

    const { id } = req.params;

    const { quantity } = req.body;

    const item =
      await updateCartItemQuantity(

        id,

        quantity,

        req.user!.userId

      );

    return res.json({

      success: true,

      data: item

    });

  } catch (error: any) {

    return res.status(400).json({

      success: false,

      message: error.message

    });

  }

}


//Delete cart 

export async function removeCartItemController(

  req: AuthRequest,

  res: Response

) {

  try {

    const { id } = req.params;

    const result =
      await removeCartItem(

        id,

        req.user!.userId

      );

    return res.json({

      success: true,

      data: result

    });

  } catch (error: any) {

    return res.status(400).json({

      success: false,

      message: error.message

    });

  }

}
