import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import { getCache, setCache, deleteCacheByPrefix } from "../config/cache";
import { clearReviewSummaryCache } from "./ai.controller";
import type { AuthRequest } from "../middlewares/auth.middleware";

// GET REVIEWS FOR A LISTING (paginated + cached 30s)
export async function getListingReviews(req: Request, res: Response, next: NextFunction) {
  try {
    const listingId = req.params["id"] as string;

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, parseInt(req.query.limit as string) || 10);
    const skip = (page - 1) * limit;

    const cacheKey = `reviews:listing:${listingId}:${page}:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { listingId },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, avatar: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.review.count({ where: { listingId } }),
    ]);

    const result = {
      data: reviews,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };

    setCache(cacheKey, result, 30);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// CREATE REVIEW
export async function createReview(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const listingId = req.params["id"] as string;
    const { rating, comment } = req.body;
    const userId = req.userId!;

    if (!rating || !comment) {
      return res.status(400).json({ message: "Rating and comment are required" });
    }

    const ratingNum = Number(rating);
    if (ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const review = await prisma.review.create({
      data: { rating: ratingNum, comment, userId, listingId },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    deleteCacheByPrefix(`reviews:listing:${listingId}`);
    clearReviewSummaryCache(listingId);
    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
}

// DELETE REVIEW
export async function deleteReview(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;

    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) return res.status(404).json({ message: "Review not found" });

    if (review.userId !== req.userId && req.role !== "ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }

    await prisma.review.delete({ where: { id } });

    deleteCacheByPrefix(`reviews:listing:${review.listingId}`);
    res.json({ message: "Review deleted" });
  } catch (error) {
    next(error);
  }
}
