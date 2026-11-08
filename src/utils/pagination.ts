export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type Paging = { skip: number; take: number };

function entier(valeur: unknown, defaut: number): number {
  const brut = Array.isArray(valeur) ? valeur[0] : valeur;
  const n = Number(brut);
  return Number.isInteger(n) ? n : defaut;
}

/** Lit ?page= et ?limit= ; les valeurs absurdes sont ramenées à des bornes raisonnables. */
export function parsePagination(query: Record<string, unknown>) {
  const page = Math.min(Math.max(entier(query.page, 1), 1), 100_000);
  const limit = Math.min(Math.max(entier(query.limit, DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE);
  const paging: Paging = { skip: (page - 1) * limit, take: limit };
  return { page, limit, paging };
}

export function pageMeta(total: number, page: number, limit: number) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}