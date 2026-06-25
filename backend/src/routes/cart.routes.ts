import { Router } from "express";
import { addToCartController,  getCartController, updateCartItemController,  removeCartItemController } from "../controllers/cart.controller";

const router = Router();

router.post(
  "/items",
  addToCartController
);

router.get(
 "/:userId",
 getCartController
);

router.patch(
 "/items/:id",
 updateCartItemController
);

router.delete(
 "/items/:id",
 removeCartItemController
);

export default router;