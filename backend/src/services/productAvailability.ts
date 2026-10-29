/**
 * Un produit n'est vendable que si sa sous-catégorie ET sa catégorie sont actives.
 * Un produit sans sous-catégorie (anciennes données) reste vendable.
 */

/** À mettre dans `include` / `select` pour lire la chaîne sous-catégorie → catégorie d'un produit. */
export const categoryChainSelect = {
  select: { isActive: true, category: { select: { isActive: true } } },
} as const;

export type CategoryChain = { isActive: boolean; category: { isActive: boolean } } | null;

export function isCategoryActive(subCategory: CategoryChain | undefined): boolean {
  return !subCategory || (subCategory.isActive && subCategory.category.isActive);
}

/** Même règle, côté requête Prisma. */
export const categoryActiveWhere = {
  OR: [
    { subCategoryId: null },
    { subCategory: { isActive: true, category: { isActive: true } } },
  ],
};