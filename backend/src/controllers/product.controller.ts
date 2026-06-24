import { Request, Response } from "express";
import { createProduct, getProducts } from "../services/product.service";


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

// Get all active products

export async function getProductsController(
  req: Request,
  res: Response
) {

  try {

    const products = await getProducts();


    res.json({
      success: true,
      data: products
    });


  } catch (error) {

    res.status(500).json({
      success:false,
      message:"Failed to fetch products"
    });

  }

}