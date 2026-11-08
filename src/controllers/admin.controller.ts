import { Request, Response } from "express";

import {
  getOrderDetails, getAllOrders, getAdminStats, getAllProductsAdmin, toggleProductStatus,
  updateProduct, getInventory, updateInventory, restockInventory,
  deleteProduct, getAdminDashboard, getInternationalOrdersToPurchase, countAllOrders, 
  countProductsAdmin, countInventory
} from "../services/admin.service";

import { postTrackingEvent } from "../services/orderTracking.service";
import { sendError, safeMessage } from "../utils/appError";
import { AuthRequest } from "../middlewares/auth.middleware";

import { getSettings, updateSettings} from "../services/settings.service";

import { createProduct } from "../services/product.service";

import { parsePagination, pageMeta } from "../utils/pagination";


export async function getAllOrdersController(req: Request, res: Response) {
  try {
    const { page, limit, paging } = parsePagination(req.query);
    const [data, total] = await Promise.all([getAllOrders(paging), countAllOrders()]);
    return res.json({ success: true, data, meta: pageMeta(total, page, limit) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: safeMessage(error) });
  }
}


export async function getOrderDetailsController(req: Request, res: Response) {
  try {
    const { id } = req.params as Record<string, string>;
    return res.json({ success: true, data: await getOrderDetails(id) });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function addTrackingEventController(req: AuthRequest, res: Response) {
  try {
    const { orderId } = req.params as Record<string, string>;
    const { status, message } = req.body;

    const event = await postTrackingEvent({
      orderId,
      status,
      message,
      actorId: req.user!.userId,
    });

    return res.status(201).json({ success: true, data: event });
  } catch (error) {
    return sendError(res, error);
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

            message: safeMessage(error)

        });

    }

}

export async function getAllProductsAdminController(req: Request, res: Response) {
  try {
    const { page, limit, paging } = parsePagination(req.query);
    const [data, total] = await Promise.all([getAllProductsAdmin(paging), countProductsAdmin()]);
    return res.json({ success: true, data, meta: pageMeta(total, page, limit) });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: safeMessage(error) });
  }
}


export async function toggleProductStatusController(
    req: Request,
    res: Response
) {

    try {

        const { id } =
            req.params as Record<string, string>;

        const product =
            await toggleProductStatus(id);

        return res.json({

            success: true,

            data: product

        });

    } catch (error: any) {

        return res.status(404).json({

            success: false,

            message: safeMessage(error)

        });

    }

}

export async function updateProductController(
  req: Request,
  res: Response
) {

  try {

    const { id } =
      req.params as Record<string, string>;

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

      message: safeMessage(error)

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

      message: safeMessage(error)

    });

  }

}


export async function getInventoryController(req: Request, res: Response) {
  try {
    const { page, limit, paging } = parsePagination(req.query);
    const [data, total] = await Promise.all([getInventory(paging), countInventory()]);
    return res.json({ success: true, data, meta: pageMeta(total, page, limit) });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: safeMessage(error) });
  }
}


export async function updateInventoryController(
  req: Request,
  res: Response
) {

  try {

    const { productId } =
      req.params as Record<string, string>;

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

      message: safeMessage(error)

    });

  }

}


export async function restockInventoryController(
  req: Request,
  res: Response
) {

  try {

    const { productId } =
      req.params as Record<string, string>;

    const {
      quantity,
      reason
    } = req.body;

    const inventory =
      await restockInventory(
        productId,
        quantity,
        reason
      );

    return res.json({

      success: true,

      data: inventory

    });

  } catch (error: any) {

    return res.status(400).json({

      success: false,

      message: safeMessage(error)

    });

  }

}


export async function getSettingsController(
  req: Request,
  res: Response
) {

  try {

    const settings =
      await getSettings();

    return res.json({

      success: true,

      data: settings

    });

  } catch (error: any) {

    return res.status(400).json({

      success: false,

      message: safeMessage(error)

    });

  }

}


export async function updateSettingsController(
  req: Request,
  res: Response
) {

  try {

    const settings =
      await updateSettings(
        req.body
      );

    return res.json({

      success: true,

      data: settings

    });

  } catch (error: any) {

    return res.status(400).json({

      success: false,

      message: safeMessage(error)

    });

  }

}


export async function deleteProductController(req: Request, res: Response) {
  try {
    const { id } = req.params as Record<string, string>;
    return res.json({ success: true, data: await deleteProduct(id) });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getAdminDashboardController(req: Request, res: Response) {
  try {
    return res.json({ success: true, data: await getAdminDashboard() });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function getToPurchaseController(req: Request, res: Response) {
  try {
    return res.json({ success: true, data: await getInternationalOrdersToPurchase() });
  } catch (error) {
    return sendError(res, error);
  }
}