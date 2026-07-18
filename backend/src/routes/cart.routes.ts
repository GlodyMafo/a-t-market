import { Router } from "express";
import { addToCartController,  getCartController, updateCartItemController,  removeCartItemController } from "../controllers/cart.controller";
import {authMiddleware} from "../middlewares/auth.middleware";


const router = Router();

router.post(
  "/",
  authMiddleware,
  addToCartController
);

router.get(
  "/me",
  authMiddleware,
  getCartController
);

router.patch(
  "/item/:id",
  authMiddleware,
  updateCartItemController
);

router.delete(
  "/item/:id",
  authMiddleware,
  removeCartItemController
);

export default router;