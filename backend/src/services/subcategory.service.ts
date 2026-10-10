import { prisma } from "../lib/prisma";
import slugify from "slugify";

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

  const slug =
    slugify(name, {

      lower: true,
      strict: true

    });

  const existing =
    await prisma.subCategory.findFirst({

      where: {

        categoryId,

        OR: [
          { name },
          { slug }
        ]

      }

    });

  if (existing) {

    throw new Error(
      "Sous-catégorie déjà existante"
    );

  }

  return prisma.subCategory.create({

    data: {

      name,
      slug,
      description,
      categoryId

    }

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
    await prisma.subCategory.findUnique({

      where: { id },

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