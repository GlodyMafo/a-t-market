import { Request, Response } from "express";
import { ExternalProductService } from "../services/externalProduct.service";

const externalProductService =
  new ExternalProductService();

export async function extractExternalProductController(
  req: Request,
  res: Response
) {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: "L'URL du produit est obligatoire.",
      });
    }

    const product =
      await externalProductService.fetchProduct(url);

    return res.status(200).json({
      success: true,
      data: product,
    });

  } catch (error: any) {

    console.error(
      "[EXTERNAL PRODUCT CONTROLLER] Erreur :",
      error
    );

    return res.status(400).json({
      success: false,
      message:
        error?.message ??
        "Impossible d'extraire le produit.",
    });
  }
}