import { Router } from "express";
import { addToCartController,  getCartController } from "../controllers/cart.controller";

const router = Router();

router.post(
  "/items",
  addToCartController
);

router.get(
 "/:userId",
 getCartController
);

export default router;