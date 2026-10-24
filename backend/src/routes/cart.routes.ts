import { Router } from "express";
import {
  addToCartController,
  getCartController,
  updateCartItemController,
  removeCartItemController,
  addQuoteToCartController,
  mergeCartController,
} from "../controllers/cart.controller";
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

// Panier hybride : devis internationaux et fusion du panier invité
router.post(
  "/quotes",
  authMiddleware,
  addQuoteToCartController
);

router.post(
  "/merge",
  authMiddleware,
  mergeCartController
);

export default router;