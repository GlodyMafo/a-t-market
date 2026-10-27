import { Router } from "express";
import { createOrderController,  getOrdersByUserController, getOrderByIdController } from "../controllers/order.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate";
import { idParams } from "../validators/common.validator";

const router = Router();

router.post(
 "/",
 authMiddleware,
 createOrderController
);

router.get(
 "/me",
 authMiddleware,
 getOrdersByUserController
);

router.get(
 "/:id",
 authMiddleware,
  validate({ params: idParams }),
 getOrderByIdController,

);

export default router;