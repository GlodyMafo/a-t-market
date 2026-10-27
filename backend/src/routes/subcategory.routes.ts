import { Router } from "express";

import {

  createSubCategoryController,
  getSubCategoriesController,
  getSubCategoryByIdController

} from "../controllers/subcategory.controller";


import { authMiddleware } from "../middlewares/auth.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";
import { idParams } from "../validators/common.validator";
import { validate } from "../middlewares/validate";

const router = Router();

router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  createSubCategoryController
);

router.get(
  "/",
  getSubCategoriesController
);

router.get(
  "/:id",
  getSubCategoryByIdController,	validate({ params: idParams })
);

export default router;