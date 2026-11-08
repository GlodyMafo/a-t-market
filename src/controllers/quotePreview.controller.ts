import { safeMessage } from "../utils/appError";
import { Request, Response } from "express";

import {
  previewInternationalQuote,
  PreviewInputError,
} from "../services/quotePreview.service";

export async function previewInternationalQuoteController(
  req: Request,
  res: Response
) {
  try {
    const { ticket, preview } = await previewInternationalQuote(req.body ?? {});

    return res.status(200).json({
      success: true,
      data: { ticket, preview },
    });
  } catch (error: any) {
    if (error instanceof PreviewInputError) {
      return res.status(400).json({ success: false, message: safeMessage(error) });
    }

    if (error?.name === "ExtractionBudgetExceededError") {
      return res.status(503).json({ success: false, message: safeMessage(error) });
    }

    // Route publique : on ne renvoie jamais un message interne.
    console.error("[QUOTE PREVIEW] Erreur :", error);
    return res.status(500).json({
      success: false,
      message: "Impossible de calculer l'aperçu pour le moment.",
    });
  }
}