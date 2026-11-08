"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSubCategoryController = createSubCategoryController;
exports.getSubCategoriesController = getSubCategoriesController;
exports.getSubCategoryByIdController = getSubCategoryByIdController;
exports.updateSubCategoryController = updateSubCategoryController;
exports.setSubCategoryActiveController = setSubCategoryActiveController;
const appError_1 = require("../utils/appError");
const subcategory_service_1 = require("../services/subcategory.service");
async function createSubCategoryController(req, res) {
    try {
        const { name, categoryId, description } = req.body;
        const subCategory = await (0, subcategory_service_1.createSubCategory)(name, categoryId, description);
        return res.status(201).json({
            success: true,
            data: subCategory
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
async function getSubCategoriesController(req, res) {
    const data = await (0, subcategory_service_1.getSubCategories)();
    return res.json({
        success: true,
        data
    });
}
async function getSubCategoryByIdController(req, res) {
    try {
        const data = await (0, subcategory_service_1.getSubCategoryById)(req.params.id);
        return res.json({
            success: true,
            data
        });
    }
    catch (error) {
        return res.status(404).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
async function updateSubCategoryController(req, res) {
    try {
        const { id } = req.params;
        return res.json({ success: true, data: await (0, subcategory_service_1.updateSubCategory)(id, req.body) });
    }
    catch (error) {
        return (0, appError_1.sendError)(res, error);
    }
}
async function setSubCategoryActiveController(req, res) {
    try {
        const { id } = req.params;
        return res.json({ success: true, data: await (0, subcategory_service_1.setSubCategoryActive)(id, req.body.isActive) });
    }
    catch (error) {
        return (0, appError_1.sendError)(res, error);
    }
}
