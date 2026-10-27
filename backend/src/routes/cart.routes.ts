import { Router } from "express";
import {
  addToCartController,
  getCartController,
  updateCartItemController,
  removeCartItemController,
  addQuoteToCartController,
  mergeCartController,
} from "../controllers/cart.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate";
import { idParams } from "../validators/common.validator";
import { addToCartSchema, updateCartItemSchema, addQuoteToCartSchema } from "../validators/cart.validator";

const router = Router();

router.post("/", authMiddleware, validate({ body: addToCartSchema }), addToCartController);
router.get("/me", authMiddleware, getCartController);
router.patch(
  "/item/:id",
  authMiddleware,
  validate({ params: idParams, body: updateCartItemSchema }),
  updateCartItemController
);
router.delete("/item/:id", authMiddleware, validate({ params: idParams }), removeCartItemController);

// Panier hybride : devis internationaux et fusion du panier invité
router.post("/quotes", authMiddleware, validate({ body: addQuoteToCartSchema }), addQuoteToCartController);
router.post("/merge", authMiddleware, mergeCartController);

export default router;