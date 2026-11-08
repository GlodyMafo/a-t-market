"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInternationalQuoteController = createInternationalQuoteController;
exports.getUserQuotesController = getUserQuotesController;
const prisma_1 = require("../lib/prisma");
const quoteFromTicket_1 = require("../services/quoteFromTicket");
const quotePreviewTicket_1 = require("../services/quotePreviewTicket");
const appError_1 = require("../utils/appError");
const internationalQuote_service_1 = require("../services/internationalQuote.service");
const externalProduct_service_1 = require("../services/externalProduct.service");
const productUrl_1 = require("../services/productUrl");
// Le nom envoyé par le client est limité en taille (le prix, lui, vient toujours de l'extraction).
function cleanProductName(value) {
    return typeof value === "string" ? value.trim().slice(0, 200) : "";
}
const externalProductService = new externalProduct_service_1.ExternalProductService();
async function createInternationalQuoteController(req, res) {
    try {
        const { productUrl, productName, productPrice, subCategoryId, options } = req.body;
        const userId = req.user?.userId;
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
                ticket = (0, quotePreviewTicket_1.verifyQuotePreviewTicket)(rawTicket);
            }
            catch {
                return res.status(400).json({
                    success: false,
                    message: "Ticket d'aperçu invalide ou expiré.",
                });
            }
            // Un ticket déjà utilisé par le même utilisateur retrouve son devis.
            const existing = await prisma_1.prisma.internationalQuote.findUnique({
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
                const quote = await prisma_1.prisma.$transaction(async (tx) => {
                    return (0, quoteFromTicket_1.createQuoteFromTicket)(tx, userId, ticket, options);
                });
                return res.status(201).json({
                    success: true,
                    data: quote,
                });
            }
            catch (error) {
                if (error instanceof quoteFromTicket_1.QuoteTicketError) {
                    return res.status(400).json({
                        success: false,
                        message: error.message,
                    });
                }
                // Deux soumissions simultanées : la contrainte previewId @unique protège la base.
                if (typeof error === "object" &&
                    error !== null &&
                    "code" in error &&
                    error.code === "P2002") {
                    const reused = await prisma_1.prisma.internationalQuote.findUnique({
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
        const parsedUrl = (0, productUrl_1.parseSupportedProductUrl)(productUrl);
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
        const supportedCurrency = currency === "AED" ? "AED" : "USD";
        const quote = await (0, internationalQuote_service_1.createInternationalQuote)(userId, parsedUrl.href, cleanProductName(productName) || product.name, Number(product.price), subCategoryId, product.weightKg, options, supportedCurrency);
        return res.status(201).json({
            success: true,
            data: quote,
        });
    }
    catch (error) {
        const message = (0, appError_1.safeMessage)(error, "Impossible de créer le devis.");
        return res.status(400).json({
            success: false,
            message,
        });
    }
}
async function getUserQuotesController(req, res) {
    try {
        const authReq = req;
        const userId = authReq.user?.userId;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Utilisateur non authentifié."
            });
        }
        const quotes = await (0, internationalQuote_service_1.getUserQuotes)(userId);
        return res.json({
            success: true,
            data: quotes,
        });
    }
    catch {
        return res.status(500).json({
            success: false,
            message: "Impossible de récupérer les devis.",
        });
    }
}
