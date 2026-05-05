import { Router } from "express";
import { validate } from "../middlewares/validate";
import { authenticate } from "../middlewares/authenticate";

import {
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  refreshTokenSchema,
} from "../modules/auth/zod";

import { login } from "../modules/auth/01_login";
import { getProfile } from "../modules/auth/03_profile";
import { changePassword } from "../modules/auth/04_change_password";
import { forgotPassword } from "../modules/auth/05_forgot_password";
import { resetPassword } from "../modules/auth/06_reset_password";
import { refreshSession } from "../modules/auth/07_refresh";
import { logout } from "../modules/auth/08_logout";

const router = Router();

// --- RUTAS PÚBLICAS ---
router.post("/login", validate(loginSchema), login);
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);
router.post("/refresh", validate(refreshTokenSchema), refreshSession);

// --- RUTAS PROTEGIDAS ---
router.get("/me", authenticate, getProfile);
router.post("/change-password", authenticate, validate(changePasswordSchema), changePassword);
router.post("/logout", authenticate, validate(refreshTokenSchema), logout);

export default router;