import { NextFunction, Request, Response } from "express";
import { sendError } from "../utils/appError";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ success: false, message: "Route introuvable" });
}

// Filet de sécurité : attrape ce qu'aucun contrôleur n'a géré (JSON invalide, bug imprévu…).
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);

  const type = (err as { type?: string } | null)?.type;
  if (type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Corps de requête JSON invalide" });
  }
  if (type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "Corps de requête trop volumineux" });
  }

  return sendError(res, err);
}