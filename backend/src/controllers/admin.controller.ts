import { Request, Response } from "express";

import { addTrackingToOrder, getOrderDetails, getAllOrders, getAdminStats, getAllProductsAdmin, toggleProductStatus, updateProduct,  getInventory,
  updateInventory } from "../services/admin.service";

import { createProduct } from "../services/product.service";

export async function getAllOrdersController(
    req: Request,
    res: Response
) {

    try {

        const orders =
            await getAllOrders();

        return res.json({

            success: true,

            data: orders

        });

    } catch (error: any) {

        return res.status(500).json({

            success: false,

            message: error.message

        });

    }

}


export async function getOrderDetailsController(
    req: Request,
    res: Response
) {

    try {

        const { id } =
            req.params;

        const order =
            await getOrderDetails(id);

        return res.json({

            success: true,

            data: order

        });

    } catch (error: any) {

        return res.status(404).json({

            success: false,

            message: error.message

        });

    }

}

export async function addTrackingEventController(
    req: Request,
    res: Response
) {

    try {

        const { orderId } =
            req.params;

        const {
            status,
            message
        } = req.body;

        const event =
            await addTrackingToOrder(
                orderId,
                status,
                message
            );

        return res.status(201).json({

            success: true,

            data: event

        });

    } catch (error: any) {

        return res.status(400).json({

            success: false,

            message: error.message

        });

    }

}

export async function getAdminStatsController(
    req: Request,
    res: Response
) {

    try {

        const stats =
            await getAdminStats();

        return res.json({

            success: true,

            data: stats

        });

    } catch (error: any) {

        return res.status(500).json({

            success: false,

            message: error.message

        });

    }

}

export async function getAllProductsAdminController(
    req: Request,
    res: Response
) {

    try {

        const products =
            await getAllProductsAdmin();

        return res.json({

            success: true,

            data: products

        });

    } catch (error: any) {

        return res.status(500).json({

            success: false,

            message: error.message

        });

    }

}

export async function toggleProductStatusController(
    req: Request,
    res: Response
) {

    try {

        const { id } =
            req.params;

        const product =
            await toggleProductStatus(id);

        return res.json({

            success: true,

            data: product

        });

    } catch (error: any) {

        return res.status(404).json({

            success: false,

            message: error.message

        });

    }

}

export async function updateProductController(
  req: Request,
  res: Response
) {

  try {

    const { id } =
      req.params;

    const product =
      await updateProduct(
        id,
        req.body
      );

    return res.json({

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



export async function createProductAdminController(
  req: Request,
  res: Response
) {

  try {

    const product =
      await createProduct(
        req.body
      );

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



export async function getInventoryController(
  req: Request,
  res: Response
) {

  try {

    const inventory =
      await getInventory();

    return res.json({

      success: true,

      data: inventory

    });

  } catch (error: any) {

    return res.status(400).json({

      success: false,

      message: error.message

    });

  }

}


export async function updateInventoryController(
  req: Request,
  res: Response
) {

  try {

    const { productId } =
      req.params;

    const { quantity } =
      req.body;

    const inventory =
      await updateInventory(
        productId,
        quantity
      );

    return res.json({

      success: true,

      data: inventory

    });

  } catch (error: any) {

    return res.status(400).json({

      success: false,

      message: error.message

    });

  }

}