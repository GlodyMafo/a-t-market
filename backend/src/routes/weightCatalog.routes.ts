import { Router } from "express";

import {

  createOrUpdateWeightCatalogController,
  getWeightCatalogController,
  getWeightBySubCategoryController

} from "../controllers/weightCatalog.controller";

import { authMiddleware } from "../middlewares/auth.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";

const router = Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.post(
  "/",
  createOrUpdateWeightCatalogController
);

router.get(
  "/",
  getWeightCatalogController
);

router.get(
  "/subcategory/:subCategoryId",
  getWeightBySubCategoryController
);

export default router;