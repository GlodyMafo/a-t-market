import { Router } from "express";

import {

  createSubCategoryController,
  getSubCategoriesController,
  getSubCategoryByIdController

} from "../controllers/subcategory.controller";

const router = Router();

router.post(
  "/",
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