import { Request, Response } from "express";
import {
  createInternationalQuote,
  getUserQuotes,
} from "../services/internationalQuote.service";
import { ExternalProductService } from "../services/externalProduct.service";
import { parseSupportedProductUrl } from "../services/productUrl";

// Le nom envoyé par le client est limité en taille (le prix, lui, vient toujours de l'extraction).
function cleanProductName(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 200) : "";
}

const externalProductService = new ExternalProductService();

export async function createInternationalQuoteController(
  req: Request,
  res: Response
) {
  try {
    const { productUrl, productName, productPrice, subCategoryId, options } = req.body;
    const userId = (req as import("../middlewares/auth.middleware").AuthRequest).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Utilisateur non authentifié."
      });
    }

    if (!userId || !productUrl || !subCategoryId) {
      return res.status(400).json({
        success: false,
        message: "productUrl et subCategoryId sont obligatoires",
      });
    }

    // Validation stricte de l'URL (domaine pris en charge, pas d'astuce d'adresse)
    const parsedUrl = parseSupportedProductUrl(productUrl);

    // Extraire le produit depuis son URL pour récupérer son poids éventuel.
    const product = await externalProductService.fetchProduct(parsedUrl.href);

    // Les montants sont en dollars : on refuse toute autre devise au lieu de l'interpréter comme des USD.
    if (String(product.currency).toUpperCase() !== "USD") {
      throw new Error("La devise de ce produit n'est pas prise en charge.");
    }

    const quote = await createInternationalQuote(
      userId,
      parsedUrl.href,
      cleanProductName(productName) || product.name,
      Number(product.price),
      subCategoryId,
      product.weightKg,
      options
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

    const authReq = req as import("../middlewares/auth.middleware").AuthRequest;
    const userId = authReq.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Utilisateur non authentifié."
      });
    }

    const quotes = await getUserQuotes(userId);

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