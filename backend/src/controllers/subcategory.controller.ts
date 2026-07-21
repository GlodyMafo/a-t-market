import { Request, Response } from "express";

import {

  createSubCategory,
  getSubCategories,
  getSubCategoryById

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

      message:error.message

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
        req.params.id
      );

    return res.json({

      success:true,

      data

    });

  } catch(error:any) {

    return res.status(404).json({

      success:false,

      message:error.message

    });

  }

}