import { prisma } from "../lib/prisma";
import slugify from "slugify";
import { Prisma } from "../../generated/prisma/client";
import { categoryActiveWhere } from "./productAvailability";
import { NotFoundError } from "../utils/appError";
import type { CatalogFilters } from "../validators/catalog.validator";

interface CreateProductData {

  name: string;
  description?: string;
  price: number;
  margin: number;
  images: string[];
  subCategoryId: string;

}

// Create a product

export async function createProduct(data: CreateProductData) {

  const {
    name,
    description,
    price,
    margin,
    images,
    subCategoryId
  } = data;

  const slug = slugify(name, {
    lower: true,
    strict: true
  });


  if (images.length > 3) {
    throw new Error(
      "Maximum 3 images par produit"
    );
  }

   const subCategory =
    await prisma.subCategory.findUnique({
      where: { id: subCategoryId },
      include: { category: { select: { isActive: true } } }
    });

  if (!subCategory) {
    throw new Error(
      "Sous-catégorie introuvable"
    );
  }

  if (!subCategory.isActive || !subCategory.category.isActive) {
    throw new Error("Cette sous-catégorie est désactivée");
  }


  const product = await prisma.$transaction(
    async (tx) => {


      const createdProduct =
        await tx.product.create({
          data: {
            name,
            slug,
            description,
            price,
            margin,
            currency: "USD",
            type: "LOCAL",
            subCategoryId,

            images: {
              create: images.map(
                (image, index) => ({
                  imageUrl: image,
                  position: index + 1
                })
              )
            },


            inventory: {
              create: {
                quantity: 0
              }
            }
          },


          include: {
            images: true,
            inventory: true
          }


        });


      return createdProduct;

    }
  );


  return product;
}


// Règle 4.14 : un produit LOCAL dont le stock est nul n'est pas visible côté client.
// Les produits INTERNATIONAUX n'ont pas de stock local : ils restent visibles.
// Un produit dont la catégorie ou la sous-catégorie est désactivée n'est pas visible non plus.
const visibleToCustomers: Prisma.ProductWhereInput = {
  isActive: true,
  AND: [
    {
      OR: [
        { type: "INTERNATIONAL" },
        { type: "LOCAL", inventory: { quantity: { gt: 0 } } }
      ]
    },
    categoryActiveWhere
  ]
};

const publicInclude = {
  images: { orderBy: { position: "asc" } },
  inventory: true,
  subCategory: { include: { category: true } }
} satisfies Prisma.ProductInclude;

/**
 * Ce que le client voit : le prix est le prix TOTAL final (prix + marge),
 * et la marge d'A&T n'est jamais exposée (règle 8 du cahier des charges).
 */
function toPublic<T extends { price: Prisma.Decimal; margin: Prisma.Decimal }>(product: T) {
  const { margin, ...rest } = product;
  return { ...rest, price: product.price.plus(margin) };
}

const normaliser = (texte: string) =>
  texte.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

async function chargerProduits(ids: string[]) {
  if (ids.length === 0) return [];

  const produits = await prisma.product.findMany({
    where: { id: { in: ids }, ...visibleToCustomers },
    include: publicInclude
  });

  const parId = new Map(produits.map((p) => [p.id, p]));
  return ids.flatMap((id) => {
    const p = parId.get(id);
    return p ? [toPublic(p)] : [];
  });
}

/**
 * Identifiants des produits visibles qui correspondent aux filtres, dans l'ordre demandé.
 *
 * Choix MVP : filtre et tri sont faits en mémoire sur une lecture légère (id, nom, prix,
 * catégorie). C'est ce qui permet une recherche insensible aux accents (« telephone » trouve
 * « Téléphone ») et un tri sur le prix final (prix + marge), que la base ne sait pas faire
 * simplement. Convient jusqu'à quelques milliers de produits ; au-delà, passer à une
 * recherche SQL dédiée.
 */
async function idsCorrespondants(filters: CatalogFilters) {
  const { q, categoryId, subCategoryId, minPrice, maxPrice } = filters;

  const and: Prisma.ProductWhereInput[] = [visibleToCustomers];
  if (categoryId) and.push({ subCategory: { categoryId } });
  if (subCategoryId) and.push({ subCategoryId });

  const candidats = await prisma.product.findMany({
    where: { AND: and },
    select: {
      id: true,
      name: true,
      price: true,
      margin: true,
      createdAt: true,
      subCategory: { select: { name: true, category: { select: { name: true } } } }
    }
  });

  const termes = normaliser(q ?? "").split(/\s+/).filter(Boolean).slice(0, 5);
  const min = minPrice === undefined ? null : new Prisma.Decimal(minPrice);
  const max = maxPrice === undefined ? null : new Prisma.Decimal(maxPrice);

  const lignes = candidats
    .map((c) => {
      const nom = normaliser(c.name);
      const contexte = normaliser(
        `${c.subCategory?.name ?? ""} ${c.subCategory?.category.name ?? ""}`
      );
      return {
        id: c.id,
        nom,
        createdAt: c.createdAt,
        prix: c.price.plus(c.margin),
        dansNom: termes.every((t) => nom.includes(t)),
        dansTout: termes.every((t) => nom.includes(t) || contexte.includes(t))
      };
    })
    .filter((l) => termes.length === 0 || l.dansTout)
    .filter((l) => (min === null || l.prix.gte(min)) && (max === null || l.prix.lte(max)));

  type Ligne = (typeof lignes)[number];
  const sort = filters.sort ?? (termes.length > 0 ? "relevance" : "newest");
  const parRecence = (a: Ligne, b: Ligne) =>
    b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id);
  const parNom = (a: Ligne, b: Ligne) =>
    a.nom.localeCompare(b.nom, "fr") || a.id.localeCompare(b.id);

  lignes.sort((a, b) => {
    switch (sort) {
      case "price_asc":
        return a.prix.cmp(b.prix) || parNom(a, b);
      case "price_desc":
        return b.prix.cmp(a.prix) || parNom(a, b);
      case "name_asc":
        return parNom(a, b);
      case "relevance":
        // Les produits dont le NOM correspond passent avant ceux qui ne correspondent que par leur catégorie.
        return Number(b.dansNom) - Number(a.dansNom) || parRecence(a, b);
      default:
        return parRecence(a, b);
    }
  });

  return lignes.map((l) => l.id);
}

/** Catalogue public : recherche, filtres, tri et pagination. */
export async function searchProducts(
  filters: CatalogFilters,
  paging: { skip: number; take: number }
) {
  const ids = await idsCorrespondants(filters);
  const page = ids.slice(paging.skip, paging.skip + paging.take);
  return { items: await chargerProduits(page), total: ids.length };
}

// Tous les produits visibles (sans pagination).
export async function getProducts() {
  return chargerProduits(await idsCorrespondants({}));
}

// Get product details by ID
export async function getProductById(id: string) {
  const product = await prisma.product.findFirst({
    where: {
      id,
      ...visibleToCustomers
    },
    include: publicInclude
  });

  if (!product) {
    throw new NotFoundError("Produit introuvable");
  }

  return toPublic(product);
}