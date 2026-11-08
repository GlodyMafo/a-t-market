"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductsController = getProductsController;
exports.getProductByIdController = getProductByIdController;
const appError_1 = require("../utils/appError");
const pagination_1 = require("../utils/pagination");
const catalog_validator_1 = require("../validators/catalog.validator");
const product_service_1 = require("../services/product.service");
// Catalogue public : recherche, filtres, tri, pagination
async function getProductsController(req, res) {
    try {
        const filters = catalog_validator_1.catalogQuerySchema.parse(req.query);
        const { page, limit, paging } = (0, pagination_1.parsePagination)(req.query);
        const { items, total } = await (0, product_service_1.searchProducts)(filters, paging);
        return res.json({
            success: true,
            data: items,
            meta: (0, pagination_1.pageMeta)(total, page, limit)
        });
    }
    catch (error) {
        return (0, appError_1.sendError)(res, error);
    }
}
// Get product details by ID
async function getProductByIdController(req, res) {
    try {
        const { id } = req.params;
        const product = await (0, product_service_1.getProductById)(id);
        return res.json({
            success: true,
            data: product
        });
    }
    catch (error) {
        return (0, appError_1.sendError)(res, error);
    }
}
