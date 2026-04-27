import express from "express";
import {
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserListings,
  getUserBookings,
} from "../controllers/users.controller";

import { authenticate } from "../middlewares/auth.middleware";

const router = express.Router();

// PUBLIC ROUTES
router.get("/", getAllUsers);
router.get("/:id", getUserById);

// AUTH REQUIRED
router.patch("/:id", authenticate, updateUser);
router.delete("/:id", authenticate, deleteUser);

// RELATION ROUTES (clean, using controllers)
router.get("/:id/listings", getUserListings);
router.get("/:id/bookings", getUserBookings);

export default router;