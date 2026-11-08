import { Router } from "express";
import 
{
  getProductsController ,
  getProductByIdController} 
  from "../controllers/product.controller";
import { idParams } from "../validators/common.validator";
import { validate } from "../middlewares/validate";
 

const router = Router();


router.get(
 "/",
 getProductsController
);

router.get(
 "/:id",
 validate({ params: idParams }),
 getProductByIdController,
 
);


export default router;