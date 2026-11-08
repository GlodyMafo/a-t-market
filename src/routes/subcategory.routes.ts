import { Router } from "express";
import {
  createSubCategoryController,
  getSubCategoriesController,
  getSubCategoryByIdController,
  updateSubCategoryController,
  setSubCategoryActiveController
} from "../controllers/subcategory.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";
import { validate } from "../middlewares/validate";
import { idParams } from "../validators/common.validator";
import {
  createSubCategorySchema,
  updateSubCategorySchema,
  setActiveSchema
} from "../validators/catalog.validator";

const router = Router();

router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  validate({ body: createSubCategorySchema }),
  createSubCategoryController
);

router.get(
  "/",
  getSubCategoriesController
);

router.get(
  "/:id",
  validate({ params: idParams }),
  getSubCategoryByIdController
);

router.patch(
  "/:id",
  authMiddleware,
  adminMiddleware,
  validate({ params: idParams, body: updateSubCategorySchema }),
  updateSubCategoryController
);

router.patch(
  "/:id/active",
  authMiddleware,
  adminMiddleware,
  validate({ params: idParams, body: setActiveSchema }),
  setSubCategoryActiveController
);

export default router;