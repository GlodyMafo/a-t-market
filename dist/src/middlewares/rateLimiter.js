"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRateLimiter = exports.loginRateLimiter = exports.previewRateLimiter = exports.extractionRateLimiter = exports.webhookRateLimiter = void 0;
const express_rate_limit_1 = __importStar(require("express-rate-limit"));
const quotes_1 = require("../config/quotes");
exports.webhookRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requêtes max par minute
    message: {
        success: false,
        message: "Too many webhook requests"
    },
    standardHeaders: true,
    legacyHeaders: false
});
/**
 * Chaque extraction lance des acteurs Apify payants : on limite par UTILISATEUR connecté
 * (et non par adresse IP, qui peut être partagée derrière un proxy).
 * À placer APRÈS authMiddleware.
 */
exports.extractionRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 10 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.userId ?? (0, express_rate_limit_1.ipKeyGenerator)(req.ip ?? ""),
    message: {
        success: false,
        message: "Trop de demandes d'extraction. Réessayez dans quelques minutes."
    }
});
/**
 * Aperçu public (sans compte) : limité par adresse IP, car l'extraction est payante.
 * Derrière un proxy (Render), TRUST_PROXY_HOPS doit être renseigné pour lire la vraie IP.
 */
exports.previewRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 10 * 60 * 1000,
    limit: quotes_1.PREVIEW_RATE_LIMIT_PER_10_MIN,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (0, express_rate_limit_1.ipKeyGenerator)(req.ip ?? ""),
    message: {
        success: false,
        message: "Trop d'aperçus demandés. Réessayez dans quelques minutes."
    }
});
const borne = (valeur, defaut) => Math.min(Math.max(Number(valeur) || defaut, 1), 100000);
/** Connexion : seules les tentatives ÉCHOUÉES comptent (un client légitime n'est jamais bloqué). */
exports.loginRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    limit: borne(process.env.AUTH_LOGIN_LIMIT, 10),
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (0, express_rate_limit_1.ipKeyGenerator)(req.ip ?? ""),
    message: {
        success: false,
        message: "Trop de tentatives de connexion. Réessayez dans quelques minutes."
    }
});
/** Inscription : limitée par adresse IP et par heure. */
exports.registerRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    limit: borne(process.env.AUTH_REGISTER_LIMIT, 5),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (0, express_rate_limit_1.ipKeyGenerator)(req.ip ?? ""),
    message: {
        success: false,
        message: "Trop d'inscriptions depuis cette adresse. Réessayez plus tard."
    }
});
