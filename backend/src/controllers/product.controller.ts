import { Request, Response } from "express";
import { createProduct } from "../services/product.service";


export async function createProductController(
  req: Request,
  res: Response
) {

  try {

    const product =
      await createProduct(req.body);


    return res.status(201).json({
      success: true,
      data: product
    });


  } catch (error: any) {


    return res.status(400).json({
      success: false,
      message: error.message
    });

  }

}