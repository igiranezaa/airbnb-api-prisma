import express from "express";
import { deleteReview, respondToReview } from "../../controllers/reviews.controller";
import { authenticate } from "../../middlewares/auth.middleware";

const router = express.Router();

router.delete("/:id", authenticate, deleteReview);
router.patch("/:id/respond", authenticate, respondToReview);

export default router;
