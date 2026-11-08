import { NormalizedExternalProduct } from "./externalProduct.types";
import {
  PREVIEW_CACHE_MAX_ENTRIES,
  PREVIEW_CACHE_TTL_MINUTES,
  PREVIEW_DAILY_BUDGET,
} from "../config/quotes";

export class ExtractionBudgetExceededError extends Error {
  constructor() {
    super("Le service d'aperçu est temporairement saturé. Réessayez plus tard.");
    this.name = "ExtractionBudgetExceededError";
  }
}

type Fetcher = (url: string) => Promise<NormalizedExternalProduct>;

/**
 * Garde-fou des extractions payantes (Apify) pour les aperçus publics :
 *  - un même lien n'est pas ré-extrait pendant une heure (cache),
 *  - des demandes simultanées pour le même lien partagent UNE seule extraction,
 *  - plafond global par jour (seules les vraies extractions consomment le budget).
 * Tout est en mémoire : valable pour une seule instance du serveur.
 */
export class ExtractionGate {
  private cache = new Map<string, { product: NormalizedExternalProduct; expiresAt: number }>();
  private inFlight = new Map<string, Promise<NormalizedExternalProduct>>();
  private budgetDay = "";
  private used = 0;

  constructor(
    private readonly options = {
      ttlMs: PREVIEW_CACHE_TTL_MINUTES * 60_000,
      maxEntries: PREVIEW_CACHE_MAX_ENTRIES,
      dailyBudget: PREVIEW_DAILY_BUDGET,
    },
    private readonly now: () => number = () => Date.now()
  ) {}

  async get(url: string, fetcher: Fetcher): Promise<NormalizedExternalProduct> {
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
      } finally {
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

  private consumeBudget(now: number) {
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

  private store(url: string, product: NormalizedExternalProduct) {
    if (this.cache.size >= this.options.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(url, { product, expiresAt: this.now() + this.options.ttlMs });
  }
}

export const previewExtractionGate = new ExtractionGate();