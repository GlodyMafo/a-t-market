import { Router } from "express";
import { createProductController } from "../controllers/product.controller";


const router = Router();


router.post(
  "/",
  createProductController
);


export default router;