import express from "express";
import {
  register,
  login,
  me as getMe,
  forgotPassword,
  resetPassword,
} from "../controllers/auth.controller";

import { authenticate } from "../middlewares/auth.middleware";

const router = express.Router();

//  AUTH
router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

//  CURRENT USER
router.get("/me", authenticate, getMe);

export default router;