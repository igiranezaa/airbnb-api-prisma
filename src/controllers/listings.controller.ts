import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import { getCache, setCache, deleteCacheByPrefix } from "../config/cache";
import type { AuthRequest } from "../middlewares/auth.middleware";

// GET ALL LISTINGS (paginated + cached 60s)
export async function getAllListings(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, parseInt(req.query.limit as string) || 10);
    const skip = (page - 1) * limit;

    const cacheKey = `listings:all:${page}:${limit}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        skip,
        take: limit,
        include: {
          host: { select: { id: true, name: true } },
          _count: { select: { bookings: true } },
        },
      }),
      prisma.listing.count(),
    ]);

    const result = {
      data: listings,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };

    setCache(cacheKey, result, 60);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// SEARCH LISTINGS
export async function searchListings(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, parseInt(req.query.limit as string) || 10);
    const skip = (page - 1) * limit;

    const { location, type, minPrice, maxPrice, guests } = req.query;

    const where: Record<string, unknown> = {};
    if (location) where.location = { contains: location as string, mode: "insensitive" };
    if (type) where.type = type as string;
    if (minPrice || maxPrice) {
      const priceFilter: Record<string, number> = {};
      if (minPrice) priceFilter.gte = parseFloat(minPrice as string);
      if (maxPrice) priceFilter.lte = parseFloat(maxPrice as string);
      where.pricePerNight = priceFilter;
    }
    if (guests) where.guests = { gte: parseInt(guests as string) };

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        skip,
        take: limit,
        include: {
          host: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.listing.count({ where }),
    ]);

    res.json({
      data: listings,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

// LISTING STATS (cached 5 min)
export async function getListingStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const cacheKey = "stats:listings";
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const [totalListings, avgPrice, byLocation, byType] = await Promise.all([
      prisma.listing.count(),
      prisma.listing.aggregate({ _avg: { pricePerNight: true } }),
      prisma.listing.groupBy({ by: ["location"], _count: { location: true } }),
      prisma.listing.groupBy({ by: ["type"], _count: { type: true } }),
    ]);

    const result = {
      totalListings,
      averagePrice: avgPrice._avg.pricePerNight,
      byLocation,
      byType,
    };

    setCache(cacheKey, result, 5 * 60);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET SINGLE LISTING
export async function getListingById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;

    const listing = await prisma.listing.findUnique({
      where: { id },
      include: {
        host: { select: { id: true, name: true } },
        bookings: {
          include: {
            guest: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!listing) return res.status(404).json({ message: "Listing not found" });
    res.json(listing);
  } catch (error) {
    next(error);
  }
}

// CREATE LISTING
export async function createListing(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { title, description, location, pricePerNight, guests, type, amenities } = req.body;
    const hostId = req.userId!;

    if (!title || !description || !location || !pricePerNight || !guests || !type || !amenities) {
      return res.status(400).json({ message: "All fields are required: title, description, location, pricePerNight, guests, type, amenities" });
    }

    const listing = await prisma.listing.create({
      data: {
        title,
        description,
        location,
        pricePerNight: Number(pricePerNight),
        guests: Number(guests),
        type,
        amenities: Array.isArray(amenities) ? amenities : [amenities],
        host: { connect: { id: hostId } },
      },
    });

    deleteCacheByPrefix("listings:");
    deleteCacheByPrefix("stats:listings");
    res.status(201).json(listing);
  } catch (error) {
    next(error);
  }
}

// UPDATE LISTING
export async function updateListing(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;

    const existing = await prisma.listing.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Listing not found" });

    const { title, description, location, pricePerNight, guests } = req.body;

    const updated = await prisma.listing.update({
      where: { id },
      data: {
        title,
        description,
        location,
        pricePerNight: pricePerNight !== undefined ? Number(pricePerNight) : undefined,
        guests: guests !== undefined ? Number(guests) : undefined,
      },
    });

    deleteCacheByPrefix("listings:");
    deleteCacheByPrefix("stats:listings");
    res.json(updated);
  } catch (error) {
    next(error);
  }
}

// DELETE LISTING
export async function deleteListing(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;

    const existing = await prisma.listing.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Listing not found" });

    await prisma.listing.delete({ where: { id } });

    deleteCacheByPrefix("listings:");
    deleteCacheByPrefix("stats:listings");
    res.json({ message: "Listing deleted successfully" });
  } catch (error) {
    next(error);
  }
}
