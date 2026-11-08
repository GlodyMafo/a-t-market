"use strict";
/**
 * Un produit n'est vendable que si sa sous-catégorie ET sa catégorie sont actives.
 * Un produit sans sous-catégorie (anciennes données) reste vendable.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoryActiveWhere = exports.categoryChainSelect = void 0;
exports.isCategoryActive = isCategoryActive;
/** À mettre dans `include` / `select` pour lire la chaîne sous-catégorie → catégorie d'un produit. */
exports.categoryChainSelect = {
    select: { isActive: true, category: { select: { isActive: true } } },
};
function isCategoryActive(subCategory) {
    return !subCategory || (subCategory.isActive && subCategory.category.isActive);
}
/** Même règle, côté requête Prisma. */
exports.categoryActiveWhere = {
    OR: [
        { subCategoryId: null },
        { subCategory: { isActive: true, category: { isActive: true } } },
    ],
};
