"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSubCategory = createSubCategory;
exports.getSubCategories = getSubCategories;
exports.getSubCategoryById = getSubCategoryById;
exports.updateSubCategory = updateSubCategory;
exports.setSubCategoryActive = setSubCategoryActive;
const prisma_1 = require("../lib/prisma");
const slugify_1 = __importDefault(require("slugify"));
const appError_1 = require("../utils/appError");
const faireSlug = (name) => (0, slugify_1.default)(name, { lower: true, strict: true });
/**
 * Le « slug » d'une sous-catégorie est unique dans toute la base, alors que le nom ne l'est que
 * dans sa catégorie : si « accessoires » existe déjà ailleurs, on prend « accessoires-<catégorie> ».
 */
async function slugLibre(name, categoryId, excludeId) {
    const base = faireSlug(name);
    const pris = (slug) => prisma_1.prisma.subCategory.findFirst({
        where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
        select: { id: true }
    });
    if (!(await pris(base)))
        return base;
    const category = await prisma_1.prisma.category.findUniqueOrThrow({
        where: { id: categoryId },
        select: { slug: true }
    });
    const alternatif = `${base}-${category.slug}`;
    if (await pris(alternatif)) {
        throw new appError_1.ConflictError("Sous-catégorie déjà existante", "SUBCATEGORY_EXISTS");
    }
    return alternatif;
}
async function createSubCategory(name, categoryId, description) {
    const category = await prisma_1.prisma.category.findUnique({
        where: {
            id: categoryId
        }
    });
    if (!category) {
        throw new Error("Catégorie introuvable");
    }
    const existing = await prisma_1.prisma.subCategory.findFirst({
        where: { categoryId, name }
    });
    if (existing) {
        throw new Error("Sous-catégorie déjà existante");
    }
    const slug = await slugLibre(name, categoryId);
    return prisma_1.prisma.subCategory
        .create({
        data: {
            name,
            slug,
            description,
            categoryId
        }
    })
        .catch((error) => {
        if (error?.code === "P2002") {
            throw new appError_1.ConflictError("Sous-catégorie déjà existante", "SUBCATEGORY_EXISTS");
        }
        throw error;
    });
}
async function getSubCategories() {
    return prisma_1.prisma.subCategory.findMany({
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
async function getSubCategoryById(id) {
    const subCategory = await prisma_1.prisma.subCategory.findFirst({
        where: { id, isActive: true, category: { isActive: true } },
        include: {
            category: true
        }
    });
    if (!subCategory) {
        throw new Error("Sous-catégorie introuvable");
    }
    return subCategory;
}
// ---------- Administration ----------
async function updateSubCategory(id, data) {
    const current = await prisma_1.prisma.subCategory.findUnique({ where: { id } });
    if (!current)
        throw new appError_1.NotFoundError("Sous-catégorie introuvable");
    const categoryId = data.categoryId ?? current.categoryId;
    const name = data.name ?? current.name;
    if (data.categoryId && data.categoryId !== current.categoryId) {
        const cible = await prisma_1.prisma.category.findUnique({ where: { id: data.categoryId }, select: { id: true } });
        if (!cible)
            throw new appError_1.NotFoundError("Catégorie introuvable");
    }
    const patch = {};
    if (data.description !== undefined)
        patch.description = data.description;
    if (categoryId !== current.categoryId)
        patch.categoryId = categoryId;
    if (name !== current.name || categoryId !== current.categoryId) {
        const doublon = await prisma_1.prisma.subCategory.findFirst({
            where: { id: { not: id }, categoryId, name }
        });
        if (doublon)
            throw new appError_1.ConflictError("Sous-catégorie déjà existante", "SUBCATEGORY_EXISTS");
        if (name !== current.name) {
            patch.name = name;
            patch.slug = await slugLibre(name, categoryId, id);
        }
    }
    return prisma_1.prisma.subCategory
        .update({ where: { id }, data: patch })
        .catch((error) => {
        if (error?.code === "P2002") {
            throw new appError_1.ConflictError("Sous-catégorie déjà existante", "SUBCATEGORY_EXISTS");
        }
        throw error;
    });
}
async function setSubCategoryActive(id, isActive) {
    const current = await prisma_1.prisma.subCategory.findUnique({ where: { id }, select: { id: true } });
    if (!current)
        throw new appError_1.NotFoundError("Sous-catégorie introuvable");
    return prisma_1.prisma.subCategory.update({ where: { id }, data: { isActive } });
}
