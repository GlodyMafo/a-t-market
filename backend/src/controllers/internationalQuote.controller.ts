
import { Request, Response } from "express";
import {
  createInternationalQuote,
  getUserQuotes,
} from "../services/internationalQuote.service";
import { ExternalProductService } from "../services/externalProduct.service";

const ALLOWED_PRODUCT_DOMAINS = [
  "shein.com",
  "alibaba.com",
  "1688.com",
  "pinduoduo.com",
  "yangkeduo.com",
  "taobao.com",
];

function isAllowedProductUrl(url: URL): boolean {
  return ALLOWED_PRODUCT_DOMAINS.some(
    (domain) =>
      url.hostname === domain ||
      url.hostname.endsWith(`.${domain}`)
  );
}

const externalProductService = new ExternalProductService();

export async function createInternationalQuoteController(
  req: Request,
  res: Response
) {
  try {
    const { productUrl, productName, productPrice, subCategoryId } = req.body;
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

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(productUrl);
    } catch {
      return res.status(400).json({
        success: false,
        message: "URL du produit invalide."
      });
    }

    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return res.status(400).json({
        success: false,
        message: "L'URL doit utiliser HTTP ou HTTPS."
      });
    }

    if (!isAllowedProductUrl(parsedUrl)) {
      return res.status(400).json({
        success: false,
        message: "Ce site n'est pas encore pris en charge.",
      });
    }

    // Extraire le produit depuis son URL pour récupérer son poids éventuel.
    const product = await externalProductService.fetchProduct(productUrl);

    const quote = await createInternationalQuote(
      userId,
      productUrl,
      productName || product.name,
      Number(product.price),
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
