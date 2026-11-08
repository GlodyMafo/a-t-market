"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConflictError = exports.NotFoundError = exports.AppError = void 0;
exports.safeMessage = safeMessage;
exports.sendError = sendError;
const zod_1 = require("zod");
class AppError extends Error {
    status;
    code;
    constructor(message, status, code) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = "AppError";
    }
}
exports.AppError = AppError;
class NotFoundError extends AppError {
    constructor(message = "Introuvable") {
        super(message, 404, "NOT_FOUND");
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends AppError {
    constructor(message, code = "CONFLICT") {
        super(message, 409, code);
    }
}
exports.ConflictError = ConflictError;
const MESSAGE_GENERIQUE = "Une erreur est survenue. Réessayez plus tard.";
// Erreurs de programmation ou de bibliothèque : leur message ne doit jamais sortir.
const NOMS_INTERNES = new Set([
    "TypeError", "RangeError", "ReferenceError", "SyntaxError", "EvalError", "URIError",
]);
/**
 * Message qu'on peut montrer au client.
 * - erreurs prévues (AppError) et erreurs métier (Error simple) : leur message ;
 * - erreurs de validation (Zod) : messages lisibles ;
 * - tout le reste (Prisma, base de données, réseau, bugs) : message générique.
 */
function safeMessage(error, fallback = MESSAGE_GENERIQUE) {
    if (error instanceof AppError)
        return error.message;
    if (error instanceof zod_1.ZodError)
        return error.issues.map((i) => i.message).join(" ; ");
    if (!(error instanceof Error))
        return fallback;
    if (NOMS_INTERNES.has(error.name) ||
        error.name.startsWith("Prisma") ||
        error.name.includes("Adapter") ||
        typeof error.code === "string" // erreurs Prisma, pg, réseau
    ) {
        return fallback;
    }
    return error.message;
}
/** Réponse d'erreur : les erreurs prévues disent la vérité, les autres ne fuient rien. */
function sendError(res, error) {
    if (error instanceof AppError) {
        return res
            .status(error.status)
            .json({ success: false, code: error.code, message: error.message });
    }
    if (error instanceof zod_1.ZodError) {
        return res.status(400).json({
            success: false,
            message: "Données invalides",
            errors: error.issues.map((i) => ({
                path: i.path.map(String).join("."),
                message: i.message,
            })),
        });
    }
    console.error("ERREUR INATTENDUE:", error);
    return res.status(500).json({ success: false, message: "Erreur interne" });
}
