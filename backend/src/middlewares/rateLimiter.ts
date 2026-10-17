import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { AuthRequest } from "./auth.middleware";

export const webhookRateLimiter = rateLimit({

    windowMs:
        60 * 1000, // 1 minute

    max:
        60, // 60 requêtes max par minute

    message: {

        success:false,

        message:
            "Too many webhook requests"

    },

    standardHeaders:
        true,

    legacyHeaders:
        false

});

/**
 * Chaque extraction lance des acteurs Apify payants : on limite par UTILISATEUR connecté
 * (et non par adresse IP, qui peut être partagée derrière un proxy).
 * À placer APRÈS authMiddleware.
 */
export const extractionRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    (req as AuthRequest).user?.userId ?? ipKeyGenerator(req.ip ?? ""),
  message: {
    success: false,
    message: "Trop de demandes d'extraction. Réessayez dans quelques minutes."
  }
});