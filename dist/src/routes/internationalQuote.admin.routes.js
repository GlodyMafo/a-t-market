"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const internationalQuote_admin_controller_1 = require("../controllers/internationalQuote.admin.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const admin_middleware_1 = require("../middlewares/admin.middleware");
const router = (0, express_1.Router)();
// Protection explicite : ne dépend plus de l'ordre de montage des routes dans app.ts.
router.use(auth_middleware_1.authMiddleware, admin_middleware_1.adminMiddleware);
router.get("/pending", internationalQuote_admin_controller_1.getPendingQuotesController);
router.get("/:id/history", internationalQuote_admin_controller_1.getQuoteHistoryController);
router.post("/approve/:id", internationalQuote_admin_controller_1.approveQuoteController);
router.post("/reject/:id", internationalQuote_admin_controller_1.rejectQuoteController);
exports.default = router;
