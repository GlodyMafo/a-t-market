"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPendingQuotesController = getPendingQuotesController;
exports.approveQuoteController = approveQuoteController;
exports.rejectQuoteController = rejectQuoteController;
exports.getQuoteHistoryController = getQuoteHistoryController;
const appError_1 = require("../utils/appError");
const zod_1 = require("zod");
const internationalQuote_admin_service_1 = require("../services/internationalQuote.admin.service");
// Poids : positif, 1000 kg maximum, 2 décimales maximum (précision de 10 g).
const approveBodySchema = zod_1.z
    .object({
    weightKg: zod_1.z
        .number()
        .positive()
        .max(1000)
        .refine((w) => Math.round(w * 100) / 100 === w, {
        message: "2 décimales maximum",
    })
        .optional(),
    adminNotes: zod_1.z.string().trim().min(1).max(500).optional(),
})
    .strict();
const rejectBodySchema = zod_1.z
    .object({
    adminNotes: zod_1.z.string().trim().min(3).max(500),
})
    .strict();
function adminIdOf(req) {
    return req.user.userId;
}
function fail(res, error) {
    if (error instanceof internationalQuote_admin_service_1.QuoteNotFoundError) {
        return res.status(404).json({ success: false, message: (0, appError_1.safeMessage)(error) });
    }
    const message = (0, appError_1.safeMessage)(error, "Erreur inattendue");
    return res.status(400).json({ success: false, message });
}
async function getPendingQuotesController(req, res) {
    const quotes = await (0, internationalQuote_admin_service_1.getPendingQuotes)();
    return res.json({
        success: true,
        data: quotes,
    });
}
async function approveQuoteController(req, res) {
    const body = approveBodySchema.safeParse(req.body ?? {});
    if (!body.success) {
        return res.status(400).json({
            success: false,
            message: "Corps invalide : weightKg (nombre positif, 2 décimales, 1000 kg max) et adminNotes (texte) uniquement.",
        });
    }
    try {
        const quote = await (0, internationalQuote_admin_service_1.approveQuote)(req.params.id, adminIdOf(req), body.data);
        return res.json({ success: true, data: quote });
    }
    catch (error) {
        return fail(res, error);
    }
}
async function rejectQuoteController(req, res) {
    const body = rejectBodySchema.safeParse(req.body ?? {});
    if (!body.success) {
        return res.status(400).json({
            success: false,
            message: "Un motif de rejet adminNotes (3 à 500 caractères) est obligatoire.",
        });
    }
    try {
        const quote = await (0, internationalQuote_admin_service_1.rejectQuote)(req.params.id, adminIdOf(req), body.data.adminNotes);
        return res.json({ success: true, data: quote });
    }
    catch (error) {
        return fail(res, error);
    }
}
async function getQuoteHistoryController(req, res) {
    try {
        const history = await (0, internationalQuote_admin_service_1.getQuoteHistory)(req.params.id);
        return res.json({ success: true, data: history });
    }
    catch (error) {
        return fail(res, error);
    }
}
