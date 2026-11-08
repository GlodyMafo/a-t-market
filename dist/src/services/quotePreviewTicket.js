"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signQuotePreviewTicket = signQuotePreviewTicket;
exports.verifyQuotePreviewTicket = verifyQuotePreviewTicket;
const node_crypto_1 = __importDefault(require("node:crypto"));
const zod_1 = require("zod");
const env_1 = require("../config/env");
const quotes_1 = require("../config/quotes");
const money = zod_1.z.string().regex(/^\d{1,8}(\.\d{1,2})?$/);
const exchangeRateSchema = zod_1.z
    .string()
    .regex(/^\d{1,2}(\.\d{1,6})?$/)
    .refine((value) => Number(value) > 0 && Number(value) <= 10);
const ticketSchema = zod_1.z
    .object({
    v: zod_1.z.literal(1),
    id: zod_1.z.string().uuid(),
    exp: zod_1.z.number().int(),
    productUrl: zod_1.z.string().min(1).max(2000),
    productName: zod_1.z.string().min(1).max(300),
    imageUrl: zod_1.z.string().max(2000).nullable(),
    productPrice: money,
    weightKg: money.nullable(),
    weightSource: zod_1.z.enum(["EXTRACTED", "CATALOG_ESTIMATE"]).nullable(),
    subCategoryId: zod_1.z.string().min(1).max(100),
    commissionRate: money,
    chinaPricePerKg: money,
    fixedFee: money,
    // Facultatifs pour accepter les anciens tickets SHEIN.
    sourceProductPrice: money.nullable().optional(),
    sourceCurrency: zod_1.z.enum(["AED", "CNY"]).nullable().optional(),
    exchangeRate: exchangeRateSchema.nullable().optional(),
    // MOQ facultatif : utilisé uniquement pour les produits 1688.
    minOrderQuantity: zod_1.z.number().int().min(1).max(999999).nullable().optional(),
})
    .strict()
    .superRefine((ticket, ctx) => {
    const fields = [
        ticket.sourceProductPrice,
        ticket.sourceCurrency,
        ticket.exchangeRate,
    ];
    const populated = fields.filter((value) => value !== undefined && value !== null).length;
    if (populated !== 0 && populated !== 3) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: "Informations de conversion incomplètes.",
        });
    }
    if (ticket.sourceProductPrice !== undefined &&
        ticket.sourceProductPrice !== null &&
        Number(ticket.sourceProductPrice) <= 0) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ["sourceProductPrice"],
            message: "Prix d'origine invalide.",
        });
    }
});
const INVALID = "Ticket d'aperçu invalide ou expiré.";
function signingKey() {
    return node_crypto_1.default
        .createHash("sha256")
        .update(`quote-preview-ticket-v1|${env_1.env.JWT_SECRET}`)
        .digest();
}
const b64 = (data) => Buffer.from(data).toString("base64url");
function sign(encodedPayload) {
    return b64(node_crypto_1.default
        .createHmac("sha256", signingKey())
        .update(encodedPayload)
        .digest());
}
function signQuotePreviewTicket(data, now = new Date()) {
    const exp = Math.floor(now.getTime() / 1000) +
        quotes_1.PREVIEW_TICKET_TTL_HOURS * 3600;
    const payload = {
        v: 1,
        id: node_crypto_1.default.randomUUID(),
        exp,
        ...data,
    };
    const encoded = b64(JSON.stringify(payload));
    return {
        ticket: `${encoded}.${sign(encoded)}`,
        payload,
        expiresAt: new Date(exp * 1000),
    };
}
function verifyQuotePreviewTicket(ticket, now = new Date()) {
    if (typeof ticket !== "string" ||
        ticket.length === 0 ||
        ticket.length > 6000) {
        throw new Error(INVALID);
    }
    const parts = ticket.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error(INVALID);
    }
    const [encoded, signature] = parts;
    const expected = Buffer.from(sign(encoded));
    const received = Buffer.from(signature);
    if (expected.length !== received.length ||
        !node_crypto_1.default.timingSafeEqual(expected, received)) {
        throw new Error(INVALID);
    }
    let parsed;
    try {
        parsed = ticketSchema.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
    }
    catch {
        throw new Error(INVALID);
    }
    if (parsed.exp * 1000 <= now.getTime()) {
        throw new Error(INVALID);
    }
    return parsed;
}
