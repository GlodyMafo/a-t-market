import { Response } from "express";
import { getTrackingByOrder, addTrackingEvent }
from "../services/tracking.service";

import { AuthRequest }
from "../middlewares/auth.middleware";

export async function getTrackingController(
  req: AuthRequest,
  res: Response
) {

  try {

    const { orderId } = req.params;

    const tracking =
      await getTrackingByOrder(
        orderId,
        req.user!.userId
      );

    return res.json({

      success: true,

      data: tracking

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
      await addTrackingEvent(
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

