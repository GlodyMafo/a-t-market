import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { sendError } from "../utils/appError";
import { pageMeta, parsePagination } from "../utils/pagination";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notification.service";

export async function listNotificationsController(req: AuthRequest, res: Response) {
  try {
    const { page, limit, paging } = parsePagination(req.query);
    const unreadOnly = req.query.unread === "true";

    const { items, total, unread } = await listNotifications(req.user!.userId, {
      unreadOnly,
      paging,
    });

    return res.json({
      success: true,
      data: items,
      meta: { ...pageMeta(total, page, limit), unread },
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function markNotificationReadController(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params as Record<string, string>;
    return res.json({
      success: true,
      data: await markNotificationRead(req.user!.userId, id),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

export async function markAllNotificationsReadController(req: AuthRequest, res: Response) {
  try {
    return res.json({
      success: true,
      data: await markAllNotificationsRead(req.user!.userId),
    });
  } catch (error) {
    return sendError(res, error);
  }
}