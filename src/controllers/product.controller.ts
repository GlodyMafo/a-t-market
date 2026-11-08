import { Request, Response } from "express";
import { sendError } from "../utils/appError";
import { parsePagination, pageMeta } from "../utils/pagination";
import { catalogQuerySchema } from "../validators/catalog.validator";
import {
  searchProducts,
  getProductById
} from "../services/product.service";

// Catalogue public : recherche, filtres, tri, pagination
export async function getProductsController(
  req: Request,
  res: Response
) {
  try {
    const filters = catalogQuerySchema.parse(req.query);
    const { page, limit, paging } = parsePagination(req.query);

    const { items, total } = await searchProducts(filters, paging);

    return res.json({
      success: true,
      data: items,
      meta: pageMeta(total, page, limit)
    });
  } catch (error) {
    return sendError(res, error);
  }
}

// Get product details by ID
export async function getProductByIdController(
  req: Request,
  res: Response
) {
  try {
    const { id } = req.params as Record<string, string>;
    const product =
      await getProductById(id);

    return res.json({
      success: true,
      data: product
    });
  } catch (error) {
    return sendError(res, error);
  }
}