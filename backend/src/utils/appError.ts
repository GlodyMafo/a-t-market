import type { Response } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Introuvable") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = "CONFLICT") {
    super(message, 409, code);
  }
}

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
export function safeMessage(error: unknown, fallback = MESSAGE_GENERIQUE): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof ZodError) return error.issues.map((i) => i.message).join(" ; ");
  if (!(error instanceof Error)) return fallback;
  if (
    NOMS_INTERNES.has(error.name) ||
    error.name.startsWith("Prisma") ||
    error.name.includes("Adapter") ||
    typeof (error as { code?: unknown }).code === "string" // erreurs Prisma, pg, réseau
  ) {
    return fallback;
  }
  return error.message;
}

/** Réponse d'erreur : les erreurs prévues disent la vérité, les autres ne fuient rien. */
export function sendError(res: Response, error: unknown) {
  if (error instanceof AppError) {
    return res
      .status(error.status)
      .json({ success: false, code: error.code, message: error.message });
  }
  if (error instanceof ZodError) {
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