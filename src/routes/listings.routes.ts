import express from "express";
import {
  getAllListings,
  getListingById,
  createListing,
  updateListing,
  deleteListing,
} from "../controllers/listings.controller";
import {
  uploadListingPhotos,
  deleteListingPhoto,
} from "../controllers/upload.controller";

import {
  authenticate,
  requireHost,
} from "../middlewares/auth.middleware";
import upload from "../config/multer";

const router = express.Router();

// 🔓 PUBLIC ROUTES
router.get("/", getAllListings);
router.get("/:id", getListingById);

// 🔒 ONLY HOST CAN CREATE LISTING
router.post("/", authenticate, requireHost, createListing);

// 🔒 MUST BE LOGGED IN (ownership check inside controller)
router.patch("/:id", authenticate, updateListing);

// 🔒 MUST BE LOGGED IN (ownership check inside controller)
router.delete("/:id", authenticate, deleteListing);

// 📸 PHOTOS
router.post("/:id/photos", authenticate, upload.array("images", 5), uploadListingPhotos);
router.delete("/:id/photos/:photoId", authenticate, deleteListingPhoto);

export default router;