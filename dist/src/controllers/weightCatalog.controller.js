"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrUpdateWeightCatalogController = createOrUpdateWeightCatalogController;
exports.getWeightCatalogController = getWeightCatalogController;
exports.getWeightBySubCategoryController = getWeightBySubCategoryController;
const appError_1 = require("../utils/appError");
const weightCatalog_service_1 = require("../services/weightCatalog.service");
async function createOrUpdateWeightCatalogController(req, res) {
    try {
        const { subCategoryId, estimatedWeightKg, notes } = req.body;
        const item = await (0, weightCatalog_service_1.createOrUpdateWeightCatalog)(subCategoryId, estimatedWeightKg, notes);
        return res.json({
            success: true,
            data: item
        });
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            message: (0, appError_1.safeMessage)(error)
        });
    }
}
async function getWeightCatalogController(req, res) {
    const data = await (0, weightCatalog_service_1.getWeightCatalog)();
    return res.json({
        success: true,
        data
    });
}
async function getWeightBySubCategoryController(req, res) {
    try {
        const data = await (0, weightCatalog_service_1.getWeightBySubCategory)(req.params.subCategoryId);
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
