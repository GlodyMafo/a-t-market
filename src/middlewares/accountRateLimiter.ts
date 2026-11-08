import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: { ip?: string }) => ipKeyGenerator(req.ip ?? ""),
} as const;

export const passwordResetRateLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { success: false, message: "Trop de demandes. Réessayez dans une heure." },
});

export const tokenSubmitRateLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { success: false, message: "Trop de tentatives. Réessayez dans quelques minutes." },
});