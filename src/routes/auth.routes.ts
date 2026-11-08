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

import { validate } from "../middlewares/validate";
import { passwordResetRateLimiter, tokenSubmitRateLimiter } from "../middlewares/accountRateLimiter";
import {
  changePasswordController, forgotPasswordController, resendVerificationController,
  resetPasswordController, verifyEmailController,
} from "../controllers/account.controller";
import { changePasswordSchema, emailSchema, resetPasswordSchema, tokenSchema } from "../validators/account.validator";

const router = Router();

router.post("/register", registerRateLimiter, registerController);
router.post("/login", loginRateLimiter, loginController);

router.get(
  "/me",
  authMiddleware,
  meController
);

router.post("/forgot-password", passwordResetRateLimiter, validate({ body: emailSchema }), forgotPasswordController);
router.post("/reset-password", tokenSubmitRateLimiter, validate({ body: resetPasswordSchema }), resetPasswordController);
router.post("/verify-email", tokenSubmitRateLimiter, validate({ body: tokenSchema }), verifyEmailController);
router.post("/verify-email/resend", authMiddleware, passwordResetRateLimiter, resendVerificationController);
router.patch("/password", authMiddleware, tokenSubmitRateLimiter, validate({ body: changePasswordSchema }), changePasswordController);


export default router;