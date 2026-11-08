import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { AuthRequest } from "./auth.middleware";
import { PREVIEW_RATE_LIMIT_PER_10_MIN } from "../config/quotes";

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

/**
 * Aperçu public (sans compte) : limité par adresse IP, car l'extraction est payante.
 * Derrière un proxy (Render), TRUST_PROXY_HOPS doit être renseigné pour lire la vraie IP.
 */
export const previewRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: PREVIEW_RATE_LIMIT_PER_10_MIN,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  message: {
    success: false,
    message: "Trop d'aperçus demandés. Réessayez dans quelques minutes."
  }
});

const borne = (valeur: string | undefined, defaut: number) =>
  Math.min(Math.max(Number(valeur) || defaut, 1), 100000);

/** Connexion : seules les tentatives ÉCHOUÉES comptent (un client légitime n'est jamais bloqué). */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: borne(process.env.AUTH_LOGIN_LIMIT, 10),
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  message: {
    success: false,
    message: "Trop de tentatives de connexion. Réessayez dans quelques minutes."
  }
});

/** Inscription : limitée par adresse IP et par heure. */
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: borne(process.env.AUTH_REGISTER_LIMIT, 5),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ""),
  message: {
    success: false,
    message: "Trop d'inscriptions depuis cette adresse. Réessayez plus tard."
  }
});