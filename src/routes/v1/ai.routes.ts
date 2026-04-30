import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import {
  aiSearch,
  generateDescription,
  chat,
  recommend,
  reviewSummary,
} from "../../controllers/ai.controller";

const router = Router();

/**
 * @swagger
 * /v1/ai/search:
 *   post:
 *     summary: Smart listing search using natural language (AI-powered)
 *     tags: [AI]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query]
 *             properties:
 *               query:
 *                 type: string
 *                 example: "apartment in Kigali under $100 for 2 guests"
 *     responses:
 *       200:
 *         description: Paginated listings matching extracted filters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 filters:
 *                   type: object
 *                   properties:
 *                     location: { type: string, nullable: true }
 *                     type: { type: string, nullable: true, enum: [APARTMENT, HOUSE, VILLA, CABIN] }
 *                     maxPrice: { type: number, nullable: true }
 *                     guests: { type: integer, nullable: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Listing' }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     totalPages: { type: integer }
 *       400:
 *         description: Missing query or no filters could be extracted
 */
router.post("/search", aiSearch);

/**
 * @swagger
 * /v1/ai/listings/{id}/generate-description:
 *   post:
 *     summary: Generate an AI description for a listing (owner only)
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Listing ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tone:
 *                 type: string
 *                 enum: [professional, casual, luxury]
 *                 default: professional
 *                 example: luxury
 *     responses:
 *       200:
 *         description: Generated description saved to the listing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 description: { type: string }
 *                 listing: { $ref: '#/components/schemas/Listing' }
 *       403:
 *         description: Forbidden — not the listing owner
 *       404:
 *         description: Listing not found
 */
router.post("/listings/:id/generate-description", authenticate, generateDescription);

/**
 * @swagger
 * /v1/ai/chat:
 *   post:
 *     summary: Guest support chatbot with optional listing context
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sessionId, message]
 *             properties:
 *               sessionId:
 *                 type: string
 *                 example: user-123-session-1
 *               message:
 *                 type: string
 *                 example: Does this place have WiFi?
 *               listingId:
 *                 type: string
 *                 nullable: true
 *                 description: Optional — inject listing context into the conversation
 *     responses:
 *       200:
 *         description: AI response with session info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 response: { type: string }
 *                 sessionId: { type: string }
 *                 messageCount: { type: integer }
 *       400:
 *         description: Missing sessionId or message
 *       404:
 *         description: Listing not found (when listingId is provided)
 */
router.post("/chat", chat);

/**
 * @swagger
 * /v1/ai/recommend:
 *   post:
 *     summary: Get AI listing recommendations based on booking history
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Recommended listings with AI reasoning
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 preferences: { type: string }
 *                 reason: { type: string }
 *                 searchFilters:
 *                   type: object
 *                   properties:
 *                     location: { type: string, nullable: true }
 *                     type: { type: string, nullable: true }
 *                     maxPrice: { type: number, nullable: true }
 *                     guests: { type: integer, nullable: true }
 *                 recommendations:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Listing' }
 *       400:
 *         description: No booking history found
 */
router.post("/recommend", authenticate, recommend);

/**
 * @swagger
 * /v1/ai/listings/{id}/review-summary:
 *   get:
 *     summary: Get an AI-generated summary of all reviews for a listing (cached 10 min)
 *     tags: [AI]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Listing ID
 *     responses:
 *       200:
 *         description: AI review summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary: { type: string }
 *                 positives:
 *                   type: array
 *                   items: { type: string }
 *                 negatives:
 *                   type: array
 *                   items: { type: string }
 *                 averageRating: { type: number }
 *                 totalReviews: { type: integer }
 *       400:
 *         description: Not enough reviews (minimum 3 required)
 *       404:
 *         description: Listing not found
 */
router.get("/listings/:id/review-summary", reviewSummary);

export default router;
