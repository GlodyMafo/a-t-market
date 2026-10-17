import { Router } from "express";

import {
  getPendingQuotesController,
  approveQuoteController,
  rejectQuoteController,
  getQuoteHistoryController,
} from "../controllers/internationalQuote.admin.controller";

import { authMiddleware } from "../middlewares/auth.middleware";
import { adminMiddleware } from "../middlewares/admin.middleware";

const router = Router();

// Protection explicite : ne dépend plus de l'ordre de montage des routes dans app.ts.
router.use(authMiddleware, adminMiddleware);

router.get("/pending", getPendingQuotesController);

router.get("/:id/history", getQuoteHistoryController);

router.post("/approve/:id", approveQuoteController);

router.post("/reject/:id", rejectQuoteController);

export default router;