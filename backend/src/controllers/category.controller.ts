import { Request, Response } from "express";

import {

  createCategory,
  getCategories,
  getCategoryById

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

      message: error.message

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
        req.params.id
      );

    return res.json({

      success: true,

      data: category

    });

  } catch (error: any) {

    return res.status(404).json({

      success: false,

      message: error.message

    });

  }

}