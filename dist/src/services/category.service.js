"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCategory = createCategory;
exports.getCategories = getCategories;
exports.getCategoryById = getCategoryById;
exports.getCategoriesAdmin = getCategoriesAdmin;
exports.updateCategory = updateCategory;
exports.setCategoryActive = setCategoryActive;
const prisma_1 = require("../lib/prisma");
const slugify_1 = __importDefault(require("slugify"));
const appError_1 = require("../utils/appError");
const faireSlug = (name) => (0, slugify_1.default)(name, { lower: true, strict: true });
async function createCategory(name, description) {
    const slug = faireSlug(name);
    const existingCategory = await prisma_1.prisma.category.findFirst({
        where: {
            OR: [
                { name },
                { slug }
            ]
        }
    });
    if (existingCategory) {
        throw new Error("Cette catégorie existe déjà");
    }
    return prisma_1.prisma.category.create({
        data: {
            name,
            slug,
            description
        }
    });
}
// Catalogue public : seules les catégories actives.
async function getCategories() {
    return prisma_1.prisma.category.findMany({
        where: { isActive: true },
        orderBy: {
            createdAt: "desc"
        }
    });
}
async function getCategoryById(id) {
    const category = await prisma_1.prisma.category.findFirst({
        where: { id, isActive: true }
    });
    if (!category) {
        throw new Error("Catégorie introuvable");
    }
    return category;
}
// ---------- Administration ----------
/** Arbre complet pour l'admin : catégories et sous-catégories, actives ou non, avec le nombre de produits. */
async function getCategoriesAdmin() {
    return prisma_1.prisma.category.findMany({
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
async function updateCategory(id, data) {
    const current = await prisma_1.prisma.category.findUnique({ where: { id } });
    if (!current)
        throw new appError_1.NotFoundError("Catégorie introuvable");
    const patch = {};
    if (data.description !== undefined)
        patch.description = data.description;
    if (data.name !== undefined && data.name !== current.name) {
        const slug = faireSlug(data.name);
        const conflit = await prisma_1.prisma.category.findFirst({
            where: { id: { not: id }, OR: [{ name: data.name }, { slug }] }
        });
        if (conflit)
            throw new appError_1.ConflictError("Cette catégorie existe déjà", "CATEGORY_EXISTS");
        patch.name = data.name;
        patch.slug = slug;
    }
    return prisma_1.prisma.category
        .update({ where: { id }, data: patch })
        .catch((error) => {
        if (error?.code === "P2002") {
            throw new appError_1.ConflictError("Cette catégorie existe déjà", "CATEGORY_EXISTS");
        }
        throw error;
    });
}
/**
 * Active ou désactive une catégorie. Rien n'est supprimé ni cascadé : ses sous-catégories et
 * ses produits disparaissent du catalogue (et ne sont plus achetables) tant qu'elle est inactive,
 * et reviennent tels quels à la réactivation.
 */
async function setCategoryActive(id, isActive) {
    const current = await prisma_1.prisma.category.findUnique({ where: { id }, select: { id: true } });
    if (!current)
        throw new appError_1.NotFoundError("Catégorie introuvable");
    return prisma_1.prisma.category.update({ where: { id }, data: { isActive } });
}
