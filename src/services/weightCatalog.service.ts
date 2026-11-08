import { prisma } from "../lib/prisma";

export async function createOrUpdateWeightCatalog(
  subCategoryId: string,
  estimatedWeightKg: number,
  notes?: string
) {

  const subCategory =
    await prisma.subCategory.findUnique({

      where: {
        id: subCategoryId
      }

    });

  if (!subCategory) {

    throw new Error(
      "Sous-catégorie introuvable"
    );

  }

  return prisma.weightCatalog.upsert({

    where: {
      subCategoryId
    },

    update: {

      estimatedWeightKg,

      notes

    },

    create: {

      subCategoryId,

      estimatedWeightKg,

      notes

    }

  });

}

export async function getWeightCatalog() {

  return prisma.weightCatalog.findMany({

    include: {

      subCategory: {

        include: {

          category: true

        }

      }

    },

    orderBy: {

      updatedAt: "desc"

    }

  });

}

export async function getWeightBySubCategory(
  subCategoryId: string
) {

  const item =
    await prisma.weightCatalog.findUnique({

      where: {
        subCategoryId
      },

      include: {

        subCategory: {

          include: {

            category: true

          }

        }

      }

    });

  if (!item) {

    throw new Error(
      "Poids estimatif introuvable"
    );

  }

  return item;

}