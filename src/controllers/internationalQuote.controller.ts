import { prisma } from "../lib/prisma";
import {
  createQuoteFromTicket,
  QuoteTicketError,
} from "../services/quoteFromTicket";
import { verifyQuotePreviewTicket } from "../services/quotePreviewTicket";

import { safeMessage } from "../utils/appError";
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

        // Création depuis un aperçu signé : aucune nouvelle extraction Apify.
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, "ticket")) {
      const { ticket: rawTicket, options } = req.body;

      let ticket;

      try {
        ticket = verifyQuotePreviewTicket(rawTicket);
      } catch {
        return res.status(400).json({
          success: false,
          message: "Ticket d'aperçu invalide ou expiré.",
        });
      }

      // Un ticket déjà utilisé par le même utilisateur retrouve son devis.
      const existing = await prisma.internationalQuote.findUnique({
        where: { previewId: ticket.id },
      });

      if (existing) {
        if (existing.userId !== userId) {
          return res.status(409).json({
            success: false,
            message: "Ce ticket a déjà été utilisé.",
          });
        }

        return res.status(200).json({
          success: true,
          data: existing,
        });
      }

      try {
        const quote = await prisma.$transaction(async (tx) => {
          return createQuoteFromTicket(tx, userId, ticket, options);
        });

        return res.status(201).json({
          success: true,
          data: quote,
        });
      } catch (error: unknown) {
        if (error instanceof QuoteTicketError) {
          return res.status(400).json({
            success: false,
            message: error.message,
          });
        }

        // Deux soumissions simultanées : la contrainte previewId @unique protège la base.
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2002"
        ) {
          const reused = await prisma.internationalQuote.findUnique({
            where: { previewId: ticket.id },
          });

          if (reused?.userId === userId) {
            return res.status(200).json({
              success: true,
              data: reused,
            });
          }

          if (reused) {
            return res.status(409).json({
              success: false,
              message: "Ce ticket a déjà été utilisé.",
            });
          }
        }

        throw error;
      }
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
    const currency = String(product.currency).toUpperCase();

    if (currency !== "USD" && currency !== "AED") {
      throw new Error("La devise de ce produit n'est pas prise en charge.");
    }

    if (product.source !== "SHEIN" && product.source !== "NOON") {
      throw new Error("Cette marketplace n'est pas encore prise en charge.");
    }

    const supportedCurrency: "USD" | "AED" =
      currency === "AED" ? "AED" : "USD";

    const quote = await createInternationalQuote(
      userId,
      parsedUrl.href,
      cleanProductName(productName) || product.name,
      Number(product.price),
      subCategoryId,
      product.weightKg,
      options,
      supportedCurrency
    );

    return res.status(201).json({
      success: true,
      data: quote,
    });
  } catch (error: unknown) {
    const message =
      safeMessage(error, "Impossible de créer le devis.");

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