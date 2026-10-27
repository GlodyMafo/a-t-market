import { Router } from "express";
import { loginRateLimiter, registerRateLimiter } from "../middlewares/rateLimiter";

import {
  registerController,
  loginController,
  meController
} from "../controllers/auth.controller";


import {
  authMiddleware
}
from "../middlewares/auth.middleware";

const router = Router();

router.post("/register", registerRateLimiter, registerController);
router.post("/login", loginRateLimiter, loginController);

router.get(
  "/me",
  authMiddleware,
  meController
);


export default router;