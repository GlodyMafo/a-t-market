import { safeMessage } from "../utils/appError";
import { Request, Response } from "express";
import { z } from "zod";

import { AuthRequest } from "../middlewares/auth.middleware";
import {
  getPendingQuotes,
  approveQuote,
  rejectQuote,
  getQuoteHistory,
  QuoteNotFoundError,
} from "../services/internationalQuote.admin.service";

// Poids : positif, 1000 kg maximum, 2 décimales maximum (précision de 10 g).
const approveBodySchema = z
  .object({
    weightKg: z
      .number()
      .positive()
      .max(1000)
      .refine((w) => Math.round(w * 100) / 100 === w, {
        message: "2 décimales maximum",
      })
      .optional(),
    adminNotes: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

const rejectBodySchema = z
  .object({
    adminNotes: z.string().trim().min(3).max(500),
  })
  .strict();

function adminIdOf(req: Request): string {
  return (req as AuthRequest).user!.userId;
}

function fail(res: Response, error: unknown) {
  if (error instanceof QuoteNotFoundError) {
    return res.status(404).json({ success: false, message: safeMessage(error) });
  }

  const message = safeMessage(error, "Erreur inattendue");
  return res.status(400).json({ success: false, message });
}

export async function getPendingQuotesController(req: Request, res: Response) {
  const quotes = await getPendingQuotes();

  return res.json({
    success: true,
    data: quotes,
  });
}

export async function approveQuoteController(req: Request, res: Response) {
  const body = approveBodySchema.safeParse(req.body ?? {});

  if (!body.success) {
    return res.status(400).json({
      success: false,
      message:
        "Corps invalide : weightKg (nombre positif, 2 décimales, 1000 kg max) et adminNotes (texte) uniquement.",
    });
  }

  try {
    const quote = await approveQuote(
      req.params.id as string,
      adminIdOf(req),
      body.data
    );

    return res.json({ success: true, data: quote });
  } catch (error) {
    return fail(res, error);
  }
}

export async function rejectQuoteController(req: Request, res: Response) {
  const body = rejectBodySchema.safeParse(req.body ?? {});

  if (!body.success) {
    return res.status(400).json({
      success: false,
      message: "Un motif de rejet adminNotes (3 à 500 caractères) est obligatoire.",
    });
  }

  try {
    const quote = await rejectQuote(
      req.params.id as string,
      adminIdOf(req),
      body.data.adminNotes
    );

    return res.json({ success: true, data: quote });
  } catch (error) {
    return fail(res, error);
  }
}

export async function getQuoteHistoryController(req: Request, res: Response) {
  try {
    const history = await getQuoteHistory(req.params.id as string);

    return res.json({ success: true, data: history });
  } catch (error) {
    return fail(res, error);
  }
}