"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrUpdateWeightCatalog = createOrUpdateWeightCatalog;
exports.getWeightCatalog = getWeightCatalog;
exports.getWeightBySubCategory = getWeightBySubCategory;
const prisma_1 = require("../lib/prisma");
async function createOrUpdateWeightCatalog(subCategoryId, estimatedWeightKg, notes) {
    const subCategory = await prisma_1.prisma.subCategory.findUnique({
        where: {
            id: subCategoryId
        }
    });
    if (!subCategory) {
        throw new Error("Sous-catégorie introuvable");
    }
    return prisma_1.prisma.weightCatalog.upsert({
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
async function getWeightCatalog() {
    return prisma_1.prisma.weightCatalog.findMany({
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
async function getWeightBySubCategory(subCategoryId) {
    const item = await prisma_1.prisma.weightCatalog.findUnique({
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
        throw new Error("Poids estimatif introuvable");
    }
    return item;
}
