"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCategoryController = createCategoryController;
exports.getCategoriesController = getCategoriesController;
exports.getCategoryByIdController = getCategoryByIdController;
exports.getCategoriesAdminController = getCategoriesAdminController;
exports.updateCategoryController = updateCategoryController;
exports.setCategoryActiveController = setCategoryActiveController;
const appError_1 = require("../utils/appError");
const category_service_1 = require("../services/category.service");
async function createCategoryController(req, res) {
    try {
        const { name, description } = req.body;
        const category = await (0, category_service_1.createCategory)(name, description);
        return res.status(201).json({
            success: true,
            data: category
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
async function getCategoriesController(req, res) {
    const categories = await (0, category_service_1.getCategories)();
    return res.json({
        success: true,
        data: categories
    });
}
async function getCategoryByIdController(req, res) {
    try {
        const category = await (0, category_service_1.getCategoryById)(req.params.id);
        return res.json({
            success: true,
            data: category
        });
    }
    catch (error) {
        return res.status(404).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
async function getCategoriesAdminController(req, res) {
    try {
        return res.json({ success: true, data: await (0, category_service_1.getCategoriesAdmin)() });
    }
    catch (error) {
        return (0, appError_1.sendError)(res, error);
    }
}
async function updateCategoryController(req, res) {
    try {
        const { id } = req.params;
        return res.json({ success: true, data: await (0, category_service_1.updateCategory)(id, req.body) });
    }
    catch (error) {
        return (0, appError_1.sendError)(res, error);
    }
}
async function setCategoryActiveController(req, res) {
    try {
        const { id } = req.params;
        return res.json({ success: true, data: await (0, category_service_1.setCategoryActive)(id, req.body.isActive) });
    }
    catch (error) {
        return (0, appError_1.sendError)(res, error);
    }
}
