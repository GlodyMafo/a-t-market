import { Router }
from "express";

import {

  getPendingQuotesController,
  approveQuoteController,
  rejectQuoteController

}
from "../controllers/internationalQuote.admin.controller";

const router = Router();

router.get(
  "/pending",
  getPendingQuotesController
);

router.post(
  "/approve/:id",
  approveQuoteController
);

router.post(
  "/reject/:id",
  rejectQuoteController
);

export default router;