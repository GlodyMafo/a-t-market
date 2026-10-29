import { prisma } from "../lib/prisma";
import slugify from "slugify";
import { ConflictError, NotFoundError } from "../utils/appError";

const faireSlug = (name: string) => slugify(name, { lower: true, strict: true });

/**
 * Le « slug » d'une sous-catégorie est unique dans toute la base, alors que le nom ne l'est que
 * dans sa catégorie : si « accessoires » existe déjà ailleurs, on prend « accessoires-<catégorie> ».
 */
async function slugLibre(name: string, categoryId: string, excludeId?: string) {
  const base = faireSlug(name);
  const pris = (slug: string) =>
    prisma.subCategory.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true }
    });

  if (!(await pris(base))) return base;

  const category = await prisma.category.findUniqueOrThrow({
    where: { id: categoryId },
    select: { slug: true }
  });
  const alternatif = `${base}-${category.slug}`;

  if (await pris(alternatif)) {
    throw new ConflictError("Sous-catégorie déjà existante", "SUBCATEGORY_EXISTS");
  }
  return alternatif;
}

export async function createSubCategory(
  name: string,
  categoryId: string,
  description?: string
) {
  const category =
    await prisma.category.findUnique({
      where: {
        id: categoryId
      }
    });

  if (!category) {
    throw new Error(
      "Catégorie introuvable"
    );
  }

  const existing =
    await prisma.subCategory.findFirst({
      where: { categoryId, name }
    });

  if (existing) {
    throw new Error(
      "Sous-catégorie déjà existante"
    );
  }

  const slug = await slugLibre(name, categoryId);

  return prisma.subCategory
    .create({
      data: {
        name,
        slug,
        description,
        categoryId
      }
    })
    .catch((error: any) => {
      if (error?.code === "P2002") {
        throw new ConflictError("Sous-catégorie déjà existante", "SUBCATEGORY_EXISTS");
      }
      throw error;
    });
}

export async function getSubCategories() {
  return prisma.subCategory.findMany({
    where: {
      isActive: true,
      category: {
        isActive: true,
      },
    },
    include: {
      category: true,
      weightCatalog: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

export async function getSubCategoryById(
  id: string
) {
  const subCategory =
    await prisma.subCategory.findFirst({
      where: { id, isActive: true, category: { isActive: true } },
      include: {
        category: true
      }
    });

  if (!subCategory) {
    throw new Error(
      "Sous-catégorie introuvable"
    );
  }

  return subCategory;
}

// ---------- Administration ----------

export async function updateSubCategory(
  id: string,
  data: { name?: string; description?: string | null; categoryId?: string }
) {
  const current = await prisma.subCategory.findUnique({ where: { id } });
  if (!current) throw new NotFoundError("Sous-catégorie introuvable");

  const categoryId = data.categoryId ?? current.categoryId;
  const name = data.name ?? current.name;

  if (data.categoryId && data.categoryId !== current.categoryId) {
    const cible = await prisma.category.findUnique({ where: { id: data.categoryId }, select: { id: true } });
    if (!cible) throw new NotFoundError("Catégorie introuvable");
  }

  const patch: {
    name?: string;
    slug?: string;
    description?: string | null;
    categoryId?: string;
  } = {};

  if (data.description !== undefined) patch.description = data.description;
  if (categoryId !== current.categoryId) patch.categoryId = categoryId;

  if (name !== current.name || categoryId !== current.categoryId) {
    const doublon = await prisma.subCategory.findFirst({
      where: { id: { not: id }, categoryId, name }
    });
    if (doublon) throw new ConflictError("Sous-catégorie déjà existante", "SUBCATEGORY_EXISTS");

    if (name !== current.name) {
      patch.name = name;
      patch.slug = await slugLibre(name, categoryId, id);
    }
  }

  return prisma.subCategory
    .update({ where: { id }, data: patch })
    .catch((error: any) => {
      if (error?.code === "P2002") {
        throw new ConflictError("Sous-catégorie déjà existante", "SUBCATEGORY_EXISTS");
      }
      throw error;
    });
}

export async function setSubCategoryActive(id: string, isActive: boolean) {
  const current = await prisma.subCategory.findUnique({ where: { id }, select: { id: true } });
  if (!current) throw new NotFoundError("Sous-catégorie introuvable");

  return prisma.subCategory.update({ where: { id }, data: { isActive } });
}