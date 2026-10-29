import { Router } from "express";
import {
  createCategoryController,
  getCategoriesController,
  getCategoryByIdController,
  updateCategoryController,
  setCategoryActiveController
} from "../controllers/category.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";
import { validate } from "../middlewares/validate";
import { idParams } from "../validators/common.validator";
import {
  createCategorySchema,
  updateCategorySchema,
  setActiveSchema
} from "../validators/catalog.validator";

const router = Router();

router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  validate({ body: createCategorySchema }),
  createCategoryController
);

router.get(
  "/",
  getCategoriesController
);

router.get(
  "/:id",
  validate({ params: idParams }),
  getCategoryByIdController
);

router.patch(
  "/:id",
  authMiddleware,
  adminMiddleware,
  validate({ params: idParams, body: updateCategorySchema }),
  updateCategoryController
);

router.patch(
  "/:id/active",
  authMiddleware,
  adminMiddleware,
  validate({ params: idParams, body: setActiveSchema }),
  setCategoryActiveController
);

export default router;