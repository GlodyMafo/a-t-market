import { prisma } from "../lib/prisma";
import slugify from "slugify";
import { ConflictError, NotFoundError } from "../utils/appError";

const faireSlug = (name: string) => slugify(name, { lower: true, strict: true });

export async function createCategory(
  name: string,
  description?: string
) {
  const slug = faireSlug(name);

  const existingCategory =
    await prisma.category.findFirst({
      where: {
        OR: [
          { name },
          { slug }
        ]
      }
    });

  if (existingCategory) {
    throw new Error(
      "Cette catégorie existe déjà"
    );
  }

  return prisma.category.create({
    data: {
      name,
      slug,
      description
    }
  });
}

// Catalogue public : seules les catégories actives.
export async function getCategories() {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: {
      createdAt: "desc"
    }
  });
}

export async function getCategoryById(
  id: string
) {
  const category =
    await prisma.category.findFirst({
      where: { id, isActive: true }
    });

  if (!category) {
    throw new Error(
      "Catégorie introuvable"
    );
  }

  return category;
}

// ---------- Administration ----------

/** Arbre complet pour l'admin : catégories et sous-catégories, actives ou non, avec le nombre de produits. */
export async function getCategoriesAdmin() {
  return prisma.category.findMany({
    include: {
      _count: { select: { subCategories: true } },
      subCategories: {
        include: { _count: { select: { products: true } } },
        orderBy: { name: "asc" }
      }
    },
    orderBy: { name: "asc" }
  });
}

export async function updateCategory(
  id: string,
  data: { name?: string; description?: string | null }
) {
  const current = await prisma.category.findUnique({ where: { id } });
  if (!current) throw new NotFoundError("Catégorie introuvable");

  const patch: { name?: string; slug?: string; description?: string | null } = {};

  if (data.description !== undefined) patch.description = data.description;

  if (data.name !== undefined && data.name !== current.name) {
    const slug = faireSlug(data.name);
    const conflit = await prisma.category.findFirst({
      where: { id: { not: id }, OR: [{ name: data.name }, { slug }] }
    });
    if (conflit) throw new ConflictError("Cette catégorie existe déjà", "CATEGORY_EXISTS");

    patch.name = data.name;
    patch.slug = slug;
  }

  return prisma.category
    .update({ where: { id }, data: patch })
    .catch((error: any) => {
      if (error?.code === "P2002") {
        throw new ConflictError("Cette catégorie existe déjà", "CATEGORY_EXISTS");
      }
      throw error;
    });
}

/**
 * Active ou désactive une catégorie. Rien n'est supprimé ni cascadé : ses sous-catégories et
 * ses produits disparaissent du catalogue (et ne sont plus achetables) tant qu'elle est inactive,
 * et reviennent tels quels à la réactivation.
 */
export async function setCategoryActive(id: string, isActive: boolean) {
  const current = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!current) throw new NotFoundError("Catégorie introuvable");

  return prisma.category.update({ where: { id }, data: { isActive } });
}