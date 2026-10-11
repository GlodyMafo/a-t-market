import { Router } from "express";

import {
  createInternationalQuoteController,
  getUserQuotesController
} from "../controllers/internationalQuote.controller";

import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.post(
  "/",
  authMiddleware,
  createInternationalQuoteController
);

router.get(
  "/user",
  authMiddleware,
  getUserQuotesController
);

export default router;