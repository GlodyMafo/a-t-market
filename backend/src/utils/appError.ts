import type { Response } from "express";

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

/** Réponse d'erreur : les erreurs prévues disent la vérité, les autres ne fuient rien. */
export function sendError(res: Response, error: unknown) {
  if (error instanceof AppError) {
    return res
      .status(error.status)
      .json({ success: false, code: error.code, message: error.message });
  }
  console.error("ERREUR INATTENDUE:", error);
  return res.status(500).json({ success: false, message: "Erreur interne" });
}