import express from "express";
import {
  getAllListings,
  getListingById,
  createListing,
  updateListing,
  deleteListing,
  searchListings,
  getListingStats,
  getHostListings,
  getBlockedDates,
  addBlockedDates,
  deleteBlockedDate,
  getWishlist,
  toggleWishlist,
  getWishlistStatus,
} from "../../controllers/listings.controller";
import {
  getListingReviews,
  createReview,
} from "../../controllers/reviews.controller";
import {
  uploadListingPhotos,
  deleteListingPhoto,
} from "../../controllers/upload.controller";

import { authenticate, requireHost } from "../../middlewares/auth.middleware";
import { strictLimiter } from "../../middlewares/rateLimiter";
import upload from "../../config/multer";

const router = express.Router();
const listingPhotoUpload = upload.fields([
  { name: "images", maxCount: 5 },
  { name: "photos", maxCount: 5 },
]);

/**
 * @swagger
 * /v1/listings:
 *   get:
 *     summary: Get all listings (paginated, cached 60s)
 *     tags: [Listings]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated list of listings
 */
router.get("/", getAllListings);

/**
 * @swagger
 * /v1/listings/search:
 *   get:
 *     summary: Search listings by filters
 *     tags: [Listings]
 *     parameters:
 *       - in: query
 *         name: location
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [APARTMENT, HOUSE, VILLA, CABIN] }
 *       - in: query
 *         name: minPrice
 *         schema: { type: number }
 *       - in: query
 *         name: maxPrice
 *         schema: { type: number }
 *       - in: query
 *         name: guests
 *         schema: { type: integer }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Filtered and paginated listings
 */
router.get("/search", searchListings);

/**
 * @swagger
 * /v1/listings/stats:
 *   get:
 *     summary: Get listing stats (cached 5 min)
 *     tags: [Listings]
 *     responses:
 *       200:
 *         description: Listing statistics
 */
router.get("/stats", getListingStats);
router.get("/host/mine", authenticate, getHostListings);
router.get("/wishlist", authenticate, getWishlist);

/**
 * @swagger
 * /v1/listings/{id}:
 *   get:
 *     summary: Get listing by ID
 *     tags: [Listings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Listing data
 */
router.get("/:id", getListingById);

/**
 * @swagger
 * /v1/listings:
 *   post:
 *     summary: Create a new listing (host only)
 *     tags: [Listings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, location, pricePerNight, guests, type, amenities]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               location: { type: string }
 *               pricePerNight: { type: number }
 *               guests: { type: integer }
 *               type: { type: string, enum: [APARTMENT, HOUSE, VILLA, CABIN] }
 *               amenities: { type: array, items: { type: string } }
 *     responses:
 *       201:
 *         description: Listing created
 */
router.post("/", authenticate, requireHost, strictLimiter, createListing);

/**
 * @swagger
 * /v1/listings/{id}:
 *   patch:
 *     summary: Update a listing
 *     tags: [Listings]
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
 *               title: { type: string }
 *               description: { type: string }
 *               location: { type: string }
 *               pricePerNight: { type: number }
 *               guests: { type: integer }
 *     responses:
 *       200:
 *         description: Listing updated
 */
router.patch("/:id", authenticate, listingPhotoUpload, updateListing);

/**
 * @swagger
 * /v1/listings/{id}:
 *   delete:
 *     summary: Delete a listing
 *     tags: [Listings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Listing deleted
 */
router.delete("/:id", authenticate, deleteListing);

/**
 * @swagger
 * /v1/listings/{id}/photos:
 *   post:
 *     summary: Upload photos to a listing (host only, max 5)
 *     tags: [Listings]
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
 *               images:
 *                 type: array
 *                 items: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Photos uploaded
 */
router.post("/:id/photos", authenticate, listingPhotoUpload, uploadListingPhotos);

/**
 * @swagger
 * /v1/listings/{id}/photos/{photoId}:
 *   delete:
 *     summary: Delete a listing photo
 *     tags: [Listings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: photoId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Photo deleted
 */
router.delete("/:id/photos/:photoId", authenticate, deleteListingPhoto);

router.get("/:id/blocked-dates", getBlockedDates);
router.post("/:id/blocked-dates", authenticate, requireHost, addBlockedDates);
router.delete("/:id/blocked-dates/:dateId", authenticate, requireHost, deleteBlockedDate);

router.get("/wishlist/:listingId/status", authenticate, getWishlistStatus);
router.post("/wishlist/:listingId", authenticate, toggleWishlist);

/**
 * @swagger
 * /v1/listings/{id}/reviews:
 *   get:
 *     summary: Get reviews for a listing (paginated, cached 30s)
 *     tags: [Reviews]
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
 *         description: Paginated reviews
 */
router.get("/:id/reviews", getListingReviews);

/**
 * @swagger
 * /v1/listings/{id}/reviews:
 *   post:
 *     summary: Add a review to a listing
 *     tags: [Reviews]
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
 *             required: [rating, comment]
 *             properties:
 *               rating: { type: integer, minimum: 1, maximum: 5, example: 4 }
 *               comment: { type: string, example: "Great place!" }
 *     responses:
 *       201:
 *         description: Review created
 */
router.post("/:id/reviews", authenticate, strictLimiter, createReview);

export default router;
