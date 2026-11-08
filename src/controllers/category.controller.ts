import { Request, Response } from "express";

import { safeMessage, sendError } from "../utils/appError";

import {
  createCategory,
  getCategories,
  getCategoryById,
  getCategoriesAdmin,
  updateCategory,
  setCategoryActive
} from "../services/category.service";


export async function createCategoryController(
  req: Request,
  res: Response
) {

  try {

    const {
      name,
      description
    } = req.body;

    const category =
      await createCategory(
        name,
        description
      );

    return res.status(201).json({

      success: true,

      data: category

    });

  } catch (error: any) {

    return res.status(400).json({

      success: false,

      message: safeMessage(error)

    });

  }

}


export async function getCategoriesController(
  req: Request,
  res: Response
) {

  const categories =
    await getCategories();

  return res.json({

    success: true,

    data: categories

  });

}


export async function getCategoryByIdController(
  req: Request,
  res: Response
) {

  try {

    const category =
      await getCategoryById(
        (req.params.id as string)
      );

    return res.json({

      success: true,

      data: category

    });

  } catch (error: any) {

    return res.status(404).json({

      success: false,

      message: safeMessage(error)

    });

  }

}


export async function getCategoriesAdminController(req: Request, res: Response) {
  try {
    return res.json({ success: true, data: await getCategoriesAdmin() });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function updateCategoryController(req: Request, res: Response) {
  try {
    const { id } = req.params as Record<string, string>;
    return res.json({ success: true, data: await updateCategory(id, req.body) });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function setCategoryActiveController(req: Request, res: Response) {
  try {
    const { id } = req.params as Record<string, string>;
    return res.json({ success: true, data: await setCategoryActive(id, req.body.isActive) });
  } catch (error) {
    return sendError(res, error);
  }
}