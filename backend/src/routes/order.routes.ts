import { Router } from "express";
import { createOrderController,  getOrdersByUserController, getOrderByIdController } from "../controllers/order.controller";


const router = Router();


router.post(
 "/",
 createOrderController
);

router.get(
 "/user/:userId",
 getOrdersByUserController
);

router.get(
 "/:id",
 getOrderByIdController
);

export default router;