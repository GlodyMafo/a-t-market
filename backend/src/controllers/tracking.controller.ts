import { Response } from "express";
import { getTrackingByOrder } from "../services/tracking.service";
import { AuthRequest } from "../middlewares/auth.middleware";
import { sendError } from "../utils/appError";

export async function getTrackingController(req: AuthRequest, res: Response) {
  try {
    const { orderId } = req.params as Record<string, string>;
    const tracking = await getTrackingByOrder(orderId, req.user!.userId);
    return res.json({ success: true, data: tracking });
  } catch (error) {
    return sendError(res, error);
  }
}