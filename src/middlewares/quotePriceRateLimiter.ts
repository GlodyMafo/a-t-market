import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export const quotePriceRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  message: { success: false, message: "Trop de demandes. Patientez un instant." },
});