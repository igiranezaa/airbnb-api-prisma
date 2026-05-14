import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import { getCache, setCache, deleteCacheByPrefix } from "../config/cache";
import { clearReviewSummaryCache } from "./ai.controller";
import type { AuthRequest } from "../middlewares/auth.middleware";

const PROHIBITED = [
  /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,           // phone numbers
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, // email addresses
  /\b(fuck|shit|bitch|nigger|asshole|bastard)\b/i,  // hate speech
];

function screenContent(text: string): string | null {
  if (PROHIBITED[0].test(text) || PROHIBITED[1].test(text))
    return "Reviews cannot contain contact information (phone or email).";
  if (PROHIBITED[2].test(text))
    return "Review contains prohibited language.";
  return null;
}

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
        include: { user: { select: { id: true, name: true, avatar: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.review.count({ where: { listingId } }),
    ]);

    const result = { data: reviews, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
    setCache(cacheKey, result, 30);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// CREATE REVIEW — FR-054 (14-day window), FR-055 (sub-ratings), FR-057 (content screening), FR-059 (recalc avg)
export async function createReview(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const listingId = req.params["id"] as string;
    const { rating, comment, cleanliness = 0, accuracy = 0, checkin = 0, communication = 0, location = 0, value = 0 } = req.body;
    const userId = req.userId!;

    if (!rating || !comment) return res.status(400).json({ message: "Rating and comment are required" });

    const ratingNum = Number(rating);
    if (ratingNum < 1 || ratingNum > 5) return res.status(400).json({ message: "Rating must be between 1 and 5" });

    // FR-057: screen comment
    const violation = screenContent(comment);
    if (violation) return res.status(400).json({ message: violation });

    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    // FR-054: 14-day post-checkout window — find a completed booking by this guest
    const recentBooking = await prisma.booking.findFirst({
      where: {
        guestId: userId,
        listingId,
        status: "CONFIRMED",
        checkOut: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      },
    });
    if (!recentBooking) {
      return res.status(403).json({ message: "You can only review listings you stayed at within the last 14 days." });
    }

    const review = await prisma.review.create({
      data: {
        rating: ratingNum,
        cleanliness: Math.min(5, Math.max(0, Number(cleanliness))),
        accuracy: Math.min(5, Math.max(0, Number(accuracy))),
        checkin: Math.min(5, Math.max(0, Number(checkin))),
        communication: Math.min(5, Math.max(0, Number(communication))),
        location: Math.min(5, Math.max(0, Number(location))),
        value: Math.min(5, Math.max(0, Number(value))),
        comment,
        userId,
        listingId,
      },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });

    // FR-059: recalculate listing average rating
    const { _avg } = await prisma.review.aggregate({
      where: { listingId },
      _avg: { rating: true },
    });
    await prisma.listing.update({
      where: { id: listingId },
      data: { rating: _avg.rating ?? 0 },
    });

    deleteCacheByPrefix(`reviews:listing:${listingId}`);
    clearReviewSummaryCache(listingId);
    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
}

// FR-058: Host responds publicly to a review
export async function respondToReview(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const { response } = req.body;

    if (!response?.trim()) return res.status(400).json({ message: "Response text is required" });

    const violation = screenContent(response);
    if (violation) return res.status(400).json({ message: violation });

    const review = await prisma.review.findUnique({
      where: { id },
      include: { listing: { select: { hostId: true } } },
    });
    if (!review) return res.status(404).json({ message: "Review not found" });

    if (review.listing.hostId !== req.userId && req.role !== "ADMIN") {
      return res.status(403).json({ message: "Only the host can respond to reviews" });
    }

    const updated = await prisma.review.update({
      where: { id },
      data: { response: response.trim() },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });

    deleteCacheByPrefix(`reviews:listing:${review.listingId}`);
    res.json(updated);
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
