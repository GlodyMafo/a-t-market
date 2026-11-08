"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.previewInternationalQuoteController = previewInternationalQuoteController;
const appError_1 = require("../utils/appError");
const quotePreview_service_1 = require("../services/quotePreview.service");
async function previewInternationalQuoteController(req, res) {
    try {
        const { ticket, preview } = await (0, quotePreview_service_1.previewInternationalQuote)(req.body ?? {});
        return res.status(200).json({
            success: true,
            data: { ticket, preview },
        });
    }
    catch (error) {
        if (error instanceof quotePreview_service_1.PreviewInputError) {
            return res.status(400).json({ success: false, message: (0, appError_1.safeMessage)(error) });
        }
        if (error?.name === "ExtractionBudgetExceededError") {
            return res.status(503).json({ success: false, message: (0, appError_1.safeMessage)(error) });
        }
        // Route publique : on ne renvoie jamais un message interne.
        console.error("[QUOTE PREVIEW] Erreur :", error);
        return res.status(500).json({
            success: false,
            message: "Impossible de calculer l'aperçu pour le moment.",
        });
    }
}
