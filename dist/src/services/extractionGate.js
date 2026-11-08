"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.previewExtractionGate = exports.ExtractionGate = exports.ExtractionBudgetExceededError = void 0;
const quotes_1 = require("../config/quotes");
class ExtractionBudgetExceededError extends Error {
    constructor() {
        super("Le service d'aperçu est temporairement saturé. Réessayez plus tard.");
        this.name = "ExtractionBudgetExceededError";
    }
}
exports.ExtractionBudgetExceededError = ExtractionBudgetExceededError;
/**
 * Garde-fou des extractions payantes (Apify) pour les aperçus publics :
 *  - un même lien n'est pas ré-extrait pendant une heure (cache),
 *  - des demandes simultanées pour le même lien partagent UNE seule extraction,
 *  - plafond global par jour (seules les vraies extractions consomment le budget).
 * Tout est en mémoire : valable pour une seule instance du serveur.
 */
class ExtractionGate {
    options;
    now;
    cache = new Map();
    inFlight = new Map();
    budgetDay = "";
    used = 0;
    constructor(options = {
        ttlMs: quotes_1.PREVIEW_CACHE_TTL_MINUTES * 60_000,
        maxEntries: quotes_1.PREVIEW_CACHE_MAX_ENTRIES,
        dailyBudget: quotes_1.PREVIEW_DAILY_BUDGET,
    }, now = () => Date.now()) {
        this.options = options;
        this.now = now;
    }
    async get(url, fetcher) {
        const now = this.now();
        const hit = this.cache.get(url);
        if (hit && hit.expiresAt > now) {
            return hit.product;
        }
        const pending = this.inFlight.get(url);
        if (pending) {
            return pending;
        }
        this.consumeBudget(now);
        const run = (async () => {
            try {
                const product = await fetcher(url);
                this.store(url, product);
                return product;
            }
            finally {
                this.inFlight.delete(url);
            }
        })();
        this.inFlight.set(url, run);
        return run;
    }
    /** Remise à zéro (tests). */
    reset() {
        this.cache.clear();
        this.inFlight.clear();
        this.budgetDay = "";
        this.used = 0;
    }
    consumeBudget(now) {
        const day = new Date(now).toISOString().slice(0, 10);
        if (day !== this.budgetDay) {
            this.budgetDay = day;
            this.used = 0;
        }
        if (this.used >= this.options.dailyBudget) {
            throw new ExtractionBudgetExceededError();
        }
        // Consommé AVANT l'appel : une extraction qui échoue coûte quand même des crédits.
        this.used++;
    }
    store(url, product) {
        if (this.cache.size >= this.options.maxEntries) {
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined)
                this.cache.delete(oldest);
        }
        this.cache.set(url, { product, expiresAt: this.now() + this.options.ttlMs });
    }
}
exports.ExtractionGate = ExtractionGate;
exports.previewExtractionGate = new ExtractionGate();
