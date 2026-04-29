import express from "express";
import { deleteReview } from "../../controllers/reviews.controller";
import { authenticate } from "../../middlewares/auth.middleware";

const router = express.Router();

/**
 * @swagger
 * /v1/reviews/{id}:
 *   delete:
 *     summary: Delete a review (owner or admin)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Review deleted
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Review not found
 */
router.delete("/:id", authenticate, deleteReview);

export default router;
