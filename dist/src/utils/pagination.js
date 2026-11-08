"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_PAGE_SIZE = exports.DEFAULT_PAGE_SIZE = void 0;
exports.parsePagination = parsePagination;
exports.pageMeta = pageMeta;
exports.DEFAULT_PAGE_SIZE = 20;
exports.MAX_PAGE_SIZE = 100;
function entier(valeur, defaut) {
    const brut = Array.isArray(valeur) ? valeur[0] : valeur;
    const n = Number(brut);
    return Number.isInteger(n) ? n : defaut;
}
/** Lit ?page= et ?limit= ; les valeurs absurdes sont ramenées à des bornes raisonnables. */
function parsePagination(query) {
    const page = Math.min(Math.max(entier(query.page, 1), 1), 100_000);
    const limit = Math.min(Math.max(entier(query.limit, exports.DEFAULT_PAGE_SIZE), 1), exports.MAX_PAGE_SIZE);
    const paging = { skip: (page - 1) * limit, take: limit };
    return { page, limit, paging };
}
function pageMeta(total, page, limit) {
    return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
