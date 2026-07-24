import { Router } from "express";

import {

  createCategoryController,
  getCategoriesController,
  getCategoryByIdController

} from "../controllers/category.controller";

import { authMiddleware } from "../middlewares/auth.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";

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
  getCategoryByIdController
);

export default router;