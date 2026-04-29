import express from "express";
import {
  register,
  login,
  me as getMe,
  forgotPassword,
  resetPassword,
} from "../../controllers/auth.controller";

import { authenticate } from "../../middlewares/auth.middleware";

const router = express.Router();

/**
 * @swagger
 * /v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, username, phone, password, role]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               username: { type: string }
 *               phone: { type: string }
 *               password: { type: string }
 *               role: { type: string, enum: [GUEST, HOST] }
 *     responses:
 *       201:
 *         description: User created
 */
router.post("/register", register);

/**
 * @swagger
 * /v1/auth/login:
 *   post:
 *     summary: Login and get JWT token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Returns JWT token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 */
router.post("/login", login);

/**
 * @swagger
 * /v1/auth/forgot-password:
 *   post:
 *     summary: Send password reset email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string }
 *     responses:
 *       200:
 *         description: Email sent
 */
router.post("/forgot-password", forgotPassword);

/**
 * @swagger
 * /v1/auth/reset-password/{token}:
 *   post:
 *     summary: Reset password using token from email
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Password updated
 */
router.post("/reset-password/:token", resetPassword);

/**
 * @swagger
 * /v1/auth/me:
 *   get:
 *     summary: Get current logged in user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user data
 */
router.get("/me", authenticate, getMe);

export default router;
