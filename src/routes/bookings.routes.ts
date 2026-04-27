import express from "express";
import {
  getAllBookings,
  getBookingById,
  createBooking,
  updateBookingStatus,
  deleteBooking,
} from "../controllers/bookings.controller";

import {
  authenticate,
  requireGuest,
} from "../middlewares/auth.middleware";

const router = express.Router();

//  ALL BOOKINGS REQUIRE AUTH
router.get("/", authenticate, getAllBookings);
router.get("/:id", authenticate, getBookingById);

//  ONLY GUEST CAN CREATE BOOKING
router.post("/", authenticate, requireGuest, createBooking);

//  UPDATE STATUS (admin-like behavior or owner logic)
router.patch("/:id/status", authenticate, updateBookingStatus);

//  DELETE BOOKING (ownership check in controller)
router.delete("/:id", authenticate, deleteBooking);

export default router;