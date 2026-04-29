import express from "express";
import {
  getAllBookings,
  getBookingById,
  createBooking,
  updateBookingStatus,
  deleteBooking,
} from "../../controllers/bookings.controller";

import {
  authenticate,
  requireGuest,
} from "../../middlewares/auth.middleware";

const router = express.Router();

/**
 * @swagger
 * /v1/bookings:
 *   get:
 *     summary: Get all bookings
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of bookings
 */
router.get("/", authenticate, getAllBookings);

/**
 * @swagger
 * /v1/bookings/{id}:
 *   get:
 *     summary: Get booking by ID
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Booking data
 */
router.get("/:id", authenticate, getBookingById);

/**
 * @swagger
 * /v1/bookings:
 *   post:
 *     summary: Create a booking (guest only)
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [listingId, checkIn, checkOut]
 *             properties:
 *               listingId: { type: string }
 *               checkIn: { type: string, format: date, example: "2026-07-01" }
 *               checkOut: { type: string, format: date, example: "2026-07-05" }
 *     responses:
 *       201:
 *         description: Booking created
 */
router.post("/", authenticate, requireGuest, createBooking);

/**
 * @swagger
 * /v1/bookings/{id}/status:
 *   patch:
 *     summary: Update booking status
 *     tags: [Bookings]
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string, enum: [PENDING, CONFIRMED, CANCELLED] }
 *     responses:
 *       200:
 *         description: Status updated
 */
router.patch("/:id/status", authenticate, updateBookingStatus);

/**
 * @swagger
 * /v1/bookings/{id}:
 *   delete:
 *     summary: Cancel a booking
 *     tags: [Bookings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Booking cancelled
 */
router.delete("/:id", authenticate, deleteBooking);

export default router;
