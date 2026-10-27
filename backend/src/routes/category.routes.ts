import { Router } from "express";

import {

  createCategoryController,
  getCategoriesController,
  getCategoryByIdController

} from "../controllers/category.controller";

import { authMiddleware } from "../middlewares/auth.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";
import { idParams } from "../validators/common.validator";
import { validate } from "../middlewares/validate";

const router = Router();

router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  createCategoryController
);

router.get(
  "/",
  getCategoriesController
);

router.get(
  "/:id",
  getCategoryByIdController,	validate({ params: idParams })
);

export default router;