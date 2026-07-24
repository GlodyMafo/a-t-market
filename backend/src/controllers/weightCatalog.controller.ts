import { Request, Response } from "express";

import {

  createOrUpdateWeightCatalog,
  getWeightCatalog,
  getWeightBySubCategory

} from "../services/weightCatalog.service";

export async function createOrUpdateWeightCatalogController(
  req: Request,
  res: Response
) {

  try {

    const {
      subCategoryId,
      estimatedWeightKg,
      notes
    } = req.body;

    const item =
      await createOrUpdateWeightCatalog(

        subCategoryId,
        estimatedWeightKg,
        notes

      );

    return res.json({

      success: true,

      data: item

    });

  } catch (error: any) {

    return res.status(400).json({

      success: false,

      message: error.message

    });

  }

}

export async function getWeightCatalogController(
  req: Request,
  res: Response
) {

  const data =
    await getWeightCatalog();

  return res.json({

    success: true,

    data

  });

}

export async function getWeightBySubCategoryController(
  req: Request,
  res: Response
) {

  try {

    const data =
      await getWeightBySubCategory(
        req.params.subCategoryId
      );

    return res.json({

      success: true,

      data

    });

  } catch (error: any) {

    return res.status(404).json({

      success: false,

      message: error.message

    });

  }

}