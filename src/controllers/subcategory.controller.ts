import { Request, Response } from "express";

import { safeMessage, sendError } from "../utils/appError";

import {
  createSubCategory,
  getSubCategories,
  getSubCategoryById,
  updateSubCategory,
  setSubCategoryActive
} from "../services/subcategory.service";

export async function createSubCategoryController(
  req: Request,
  res: Response
) {

  try {

    const {
      name,
      categoryId,
      description
    } = req.body;

    const subCategory =
      await createSubCategory(
        name,
        categoryId,
        description
      );

    return res.status(201).json({

      success: true,

      data: subCategory

    });

  } catch(error:any) {

    return res.status(400).json({

      success:false,

      message: safeMessage(error)

    });

  }

}

export async function getSubCategoriesController(
  req: Request,
  res: Response
) {

  const data =
    await getSubCategories();

  return res.json({

    success:true,

    data

  });

}

export async function getSubCategoryByIdController(
  req: Request,
  res: Response
) {

  try {

    const data =
      await getSubCategoryById(
        (req.params.id as string)
      );

    return res.json({

      success:true,

      data

    });

  } catch(error:any) {

    return res.status(404).json({

      success:false,

      message: safeMessage(error)

    });

  }

}

export async function updateSubCategoryController(req: Request, res: Response) {
  try {
    const { id } = req.params as Record<string, string>;
    return res.json({ success: true, data: await updateSubCategory(id, req.body) });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function setSubCategoryActiveController(req: Request, res: Response) {
  try {
    const { id } = req.params as Record<string, string>;
    return res.json({ success: true, data: await setSubCategoryActive(id, req.body.isActive) });
  } catch (error) {
    return sendError(res, error);
  }
}