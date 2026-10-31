
import crypto from "node:crypto";
import { z } from "zod";

import { env } from "../config/env";
import { PREVIEW_TICKET_TTL_HOURS } from "../config/quotes";

const money = z.string().regex(/^\d{1,8}(\.\d{1,2})?$/);
const exchangeRateSchema = z
  .string()
  .regex(/^\d{1,2}(\.\d{1,6})?$/)
  .refine((value) => Number(value) > 0 && Number(value) <= 10);

const ticketSchema = z
  .object({
    v: z.literal(1),
    id: z.string().uuid(),
    exp: z.number().int(),
    productUrl: z.string().min(1).max(2000),
    productName: z.string().min(1).max(300),
    imageUrl: z.string().max(2000).nullable(),
    productPrice: money,
    weightKg: money.nullable(),
    weightSource: z.enum(["EXTRACTED", "CATALOG_ESTIMATE"]).nullable(),
    subCategoryId: z.string().min(1).max(100),
    commissionRate: money,
    chinaPricePerKg: money,
    fixedFee: money,

    // Facultatifs pour accepter les anciens tickets SHEIN.
    sourceProductPrice: money.nullable().optional(),
    sourceCurrency: z.enum(["AED", "CNY"]).nullable().optional(),
    exchangeRate: exchangeRateSchema.nullable().optional(),
  })
  .strict()
  .superRefine((ticket, ctx) => {
    const fields = [
      ticket.sourceProductPrice,
      ticket.sourceCurrency,
      ticket.exchangeRate,
    ];

    const populated = fields.filter(
      (value) => value !== undefined && value !== null
    ).length;

    if (populated !== 0 && populated !== 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informations de conversion incomplètes.",
      });
    }

    if (
      ticket.sourceProductPrice !== undefined &&
      ticket.sourceProductPrice !== null &&
      Number(ticket.sourceProductPrice) <= 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceProductPrice"],
        message: "Prix d'origine invalide.",
      });
    }
  });

export type QuotePreviewTicket = z.infer<typeof ticketSchema>;

export type QuotePreviewTicketData = Omit<
  QuotePreviewTicket,
  "v" | "id" | "exp"
>;

const INVALID = "Ticket d'aperçu invalide ou expiré.";

function signingKey(): Buffer {
  return crypto
    .createHash("sha256")
    .update(`quote-preview-ticket-v1|${env.JWT_SECRET}`)
    .digest();
}

const b64 = (data: Buffer | string) =>
  Buffer.from(data).toString("base64url");

function sign(encodedPayload: string): string {
  return b64(
    crypto
      .createHmac("sha256", signingKey())
      .update(encodedPayload)
      .digest()
  );
}

export function signQuotePreviewTicket(
  data: QuotePreviewTicketData,
  now: Date = new Date()
): {
  ticket: string;
  payload: QuotePreviewTicket;
  expiresAt: Date;
} {
  const exp =
    Math.floor(now.getTime() / 1000) +
    PREVIEW_TICKET_TTL_HOURS * 3600;

  const payload: QuotePreviewTicket = {
    v: 1,
    id: crypto.randomUUID(),
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

export function verifyQuotePreviewTicket(
  ticket: unknown,
  now: Date = new Date()
): QuotePreviewTicket {
  if (
    typeof ticket !== "string" ||
    ticket.length === 0 ||
    ticket.length > 6000
  ) {
    throw new Error(INVALID);
  }

  const parts = ticket.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(INVALID);
  }

  const [encoded, signature] = parts;

  const expected = Buffer.from(sign(encoded));
  const received = Buffer.from(signature);

  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    throw new Error(INVALID);
  }

  let parsed: QuotePreviewTicket;

  try {
    parsed = ticketSchema.parse(
      JSON.parse(
        Buffer.from(encoded, "base64url").toString("utf8")
      )
    );
  } catch {
    throw new Error(INVALID);
  }

  if (parsed.exp * 1000 <= now.getTime()) {
    throw new Error(INVALID);
  }

  return parsed;
}
