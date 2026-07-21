import { prisma } from "../lib/prisma";
import slugify from "slugify";

export async function createCategory(
  name: string,
  description?: string
) {

  const slug =
    slugify(name, {
      lower: true,
      strict: true
    });

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


export async function getCategories() {

  return prisma.category.findMany({

    orderBy: {
      createdAt: "desc"
    }

  });

}


export async function getCategoryById(
  id: string
) {

  const category =
    await prisma.category.findUnique({

      where: { id }

    });

  if (!category) {

    throw new Error(
      "Catégorie introuvable"
    );

  }

  return category;

}