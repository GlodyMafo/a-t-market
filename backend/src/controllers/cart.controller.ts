import { Request, Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import {
  addToCart,
  getCartByUser,
  updateCartItemQuantity,
  removeCartItem,
  addQuoteToCart,
  mergeGuestCart,
  MergeInputError,
} from "../services/cart.service";


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

    const { id } = req.params as Record<string, string>;

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

    const { id } = req.params as Record<string, string>;

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


// Ajouter un devis international (le sien) au panier
export async function addQuoteToCartController(
  req: AuthRequest,
  res: Response
) {
  try {
    const result = await addQuoteToCart(
      req.user!.userId,
      (req.body ?? {}).quoteId
    );

    return res.status(result.status === "ADDED" ? 201 : 200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
}

// Fusionner le panier invité avec le panier du compte (après connexion)
export async function mergeCartController(
  req: AuthRequest,
  res: Response
) {
  try {
    const result = await mergeGuestCart(req.user!.userId, req.body ?? {});

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error instanceof MergeInputError) {
      return res.status(400).json({ success: false, message: error.message });
    }

    // Deux fusions simultanées avec le même ticket : la seconde échoue sur l'unicité.
    if (error?.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Conflit pendant la fusion : réessayez.",
      });
    }

    console.error("[CART MERGE] Erreur :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible de fusionner le panier pour le moment.",
    });
  }
}