import { Router } from "express";
import {
  listNotificationsController,
  markAllNotificationsReadController,
  markNotificationReadController,
} from "../controllers/notification.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate";
import { idParams } from "../validators/common.validator";

const router = Router();

router.use(authMiddleware);

router.get("/", listNotificationsController);
router.patch("/read-all", markAllNotificationsReadController);
router.patch("/:id/read", validate({ params: idParams }), markNotificationReadController);

export default router;