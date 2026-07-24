import { Router } from "express";

import {

  createOrUpdateWeightCatalogController,
  getWeightCatalogController,
  getWeightBySubCategoryController

} from "../controllers/weightCatalog.controller";

const router = Router();

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