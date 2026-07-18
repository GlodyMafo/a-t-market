import { Router } from "express";
import { createOrderController,  getOrdersByUserController, getOrderByIdController } from "../controllers/order.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

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
 getOrderByIdController
);

export default router;