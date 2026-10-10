
import { Request, Response } from "express";
import {
  createInternationalQuote,
  getUserQuotes,
} from "../services/internationalQuote.service";
import { ExternalProductService } from "../services/externalProduct.service";

const externalProductService = new ExternalProductService();

export async function createInternationalQuoteController(
  req: Request,
  res: Response
) {
  try {
    const {
      userId,
      productUrl,
      productName,
      productPrice,
      subCategoryId,
    } = req.body;

    if (!userId || !productUrl || !subCategoryId) {
      return res.status(400).json({
        success: false,
        message: "userId, productUrl et subCategoryId sont obligatoires.",
      });
    }

    // Extraire le produit depuis son URL pour récupérer son poids éventuel.
    const product = await externalProductService.fetchProduct(productUrl);

    const quote = await createInternationalQuote(
      userId,
      productUrl,
      productName || product.name,
      Number(productPrice ?? product.price),
      subCategoryId,
      product.weightKg
    );

    return res.status(201).json({
      success: true,
      data: quote,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Impossible de créer le devis.";

    return res.status(400).json({
      success: false,
      message,
    });
  }
}

export async function getUserQuotesController(
  req: Request,
  res: Response
) {
  try {
    const quotes = await getUserQuotes(req.params.userId);

    return res.json({
      success: true,
      data: quotes,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Impossible de récupérer les devis.",
    });
  }
}
