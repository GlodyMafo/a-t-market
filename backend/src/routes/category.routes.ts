import { Router } from "express";

import {

  createCategoryController,
  getCategoriesController,
  getCategoryByIdController

} from "../controllers/category.controller";

const router = Router();

router.post(
  "/",
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