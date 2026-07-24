import { Router } from "express";

import {

  createSubCategoryController,
  getSubCategoriesController,
  getSubCategoryByIdController

} from "../controllers/subcategory.controller";


import { authMiddleware } from "../middlewares/auth.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";

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
  getSubCategoryByIdController
);

export default router;