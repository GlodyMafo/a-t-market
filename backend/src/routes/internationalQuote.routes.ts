import { Router }
from "express";

import {

  createInternationalQuoteController,
  getUserQuotesController

}
from "../controllers/internationalQuote.controller";

const router = Router();

router.post(
  "/",
  createInternationalQuoteController
);

router.get(
  "/user/:userId",
  getUserQuotesController
);

export default router;