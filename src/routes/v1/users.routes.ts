import express from "express";
import {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserListings,
  getUserBookings,
  getUserStats,
} from "../../controllers/users.controller";
import { uploadAvatar, deleteAvatar } from "../../controllers/upload.controller";

import { authenticate, requireAdmin } from "../../middlewares/auth.middleware";
import upload from "../../config/multer";

const router = express.Router();

/**
 * @swagger
 * /v1/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden, Require ADMIN only
 */
router.get("/", authenticate, requireAdmin, getAllUsers);

/**
 * @swagger
 * /v1/users/stats:
 *   get:
 *     summary: Get user stats (cached 5 min)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User statistics
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden, Require ADMIN only
 */
router.get("/stats", authenticate, requireAdmin, getUserStats);

/**
 * @swagger
 * /v1/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User data
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", authenticate, getUserById);

/**
 * @swagger
 * /v1/users/{id}:
 *   patch:
 *     summary: Update user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               phone: { type: string }
 *     responses:
 *       200:
 *         description: Updated user
 */
router.patch("/:id", authenticate, updateUser);

/**
 * @swagger
 * /v1/users/{id}:
 *   delete:
 *     summary: Delete user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User deleted
 */
router.delete("/:id", authenticate, deleteUser);

/**
 * @swagger
 * /v1/users/{id}/listings:
 *   get:
 *     summary: Get all listings by a user
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of listings
 *       401:
 *         description: Unauthorized
 */
router.get("/:id/listings", authenticate, getUserListings);

/**
 * @swagger
 * /v1/users/{id}/bookings:
 *   get:
 *     summary: Get all bookings by a user (paginated)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated list of bookings
 */
router.get("/:id/bookings", getUserBookings);

/**
 * @swagger
 * /v1/users/{id}/avatar:
 *   post:
 *     summary: Upload user avatar
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Avatar uploaded
 */
router.post("/:id/avatar", authenticate, upload.single("image"), uploadAvatar);

/**
 * @swagger
 * /v1/users/{id}/avatar:
 *   delete:
 *     summary: Delete user avatar
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Avatar removed
 */
router.delete("/:id/avatar", authenticate, deleteAvatar);

export default router;
