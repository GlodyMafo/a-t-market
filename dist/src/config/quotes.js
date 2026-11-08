"use strict";
/** Réglages métier des devis internationaux et de l'aperçu pour invités. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PREVIEW_RATE_LIMIT_PER_10_MIN = exports.PREVIEW_DAILY_BUDGET = exports.PREVIEW_CACHE_MAX_ENTRIES = exports.PREVIEW_CACHE_TTL_MINUTES = exports.PREVIEW_TICKET_TTL_HOURS = exports.QUOTE_VALIDITY_DAYS = void 0;
/** Durée de validité du prix d'un devis validé (en jours). Au-delà, il faut refaire un devis. */
exports.QUOTE_VALIDITY_DAYS = 7;
/** Durée de vie d'un ticket d'aperçu (panier invité), en heures. */
exports.PREVIEW_TICKET_TTL_HOURS = 24;
/** Un même lien n'est pas ré-extrait (Apify est payant) pendant cette durée, en minutes. */
exports.PREVIEW_CACHE_TTL_MINUTES = 60;
exports.PREVIEW_CACHE_MAX_ENTRIES = 500;
/** Plafond global d'extractions payantes par jour pour les aperçus publics. */
exports.PREVIEW_DAILY_BUDGET = 300;
/** Aperçus par adresse IP et par fenêtre de 10 minutes. */
exports.PREVIEW_RATE_LIMIT_PER_10_MIN = Math.min(Math.max(Number(process.env.PREVIEW_RATE_LIMIT_PER_10_MIN) || 5, 1), 1000);
