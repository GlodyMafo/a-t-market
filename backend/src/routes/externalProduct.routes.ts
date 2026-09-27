import { Router } from "express";
import {
  extractExternalProductController,
} from "../controllers/externalProduct.controller";

const router = Router();

router.post(
  "/extract",
  extractExternalProductController
);

export default router;