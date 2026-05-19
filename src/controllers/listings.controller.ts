import { Request, Response, NextFunction } from "express";
import { ListingType } from "@prisma/client";
import prisma from "../config/prisma";
import { getCache, setCache, deleteCacheByPrefix } from "../config/cache";
import { uploadToCloudinary } from "../config/cloudinary";
import type { AuthRequest } from "../middlewares/auth.middleware";

const LISTING_INCLUDE = {
  host: { select: { id: true, name: true, avatar: true } },
  _count: { select: { bookings: true, reviews: true } },
  reviews: { select: { rating: true } },
} as const;

const MIN_LISTING_PHOTOS = 3;
const MAX_LISTING_PHOTOS = 100;
const MAX_DATA_IMAGE_SIZE = 20 * 1024 * 1024;
const LISTING_TYPES: ListingType[] = ["APARTMENT", "HOUSE", "VILLA", "CABIN"];

function normalizeString(value: string) {
  return value.trim();
}

function photoUrlFromValue(value: unknown): string | null {
  if (typeof value === "string") {
    const normalized = normalizeString(value);
    return normalized ? normalized : null;
  }

  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const possibleUrl = record["url"] ?? record["secure_url"] ?? record["imageUrl"] ?? record["src"];

  if (typeof possibleUrl !== "string") return null;

  const normalized = normalizeString(possibleUrl);
  return normalized ? normalized : null;
}

function dataImageToBuffer(value: string) {
  const match = value.match(/^data:(image\/(?:jpeg|png|webp|heic|heif));(?:[^,]*;)?base64,(.+)$/i);
  if (!match) return null;

  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_DATA_IMAGE_SIZE) return null;

  return buffer;
}

async function uploadDataImagePhotos(photos: string[]) {
  const uploadedPhotos: string[] = [];

  for (const photo of photos) {
    const buffer = dataImageToBuffer(photo);
    if (!buffer) {
      uploadedPhotos.push(photo);
      continue;
    }

    const uploaded = await uploadToCloudinary(buffer, "airbnb/listings");
    uploadedPhotos.push(uploaded.url);
  }

  return uploadedPhotos;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value.map(photoUrlFromValue).filter((item): item is string => Boolean(item));
  }
  if (typeof value !== "string") return [];

  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map(photoUrlFromValue).filter((item): item is string => Boolean(item));
    }
  } catch (_) {}

  return trimmed.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return Boolean(value);
}

function parseListingType(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toUpperCase();
  return LISTING_TYPES.includes(normalized as ListingType) ? normalized as ListingType : null;
}

function listingUploadFiles(req: AuthRequest) {
  if (Array.isArray(req.files)) return req.files;

  const filesByField = req.files as
    | Record<string, Express.Multer.File[]>
    | undefined;

  return [
    ...(filesByField?.["images"] ?? []),
    ...(filesByField?.["photos"] ?? []),
  ];
}

function enrichRating<T extends { reviews: { rating: number }[] }>(l: T) {
  const { reviews, ...rest } = l;
  return {
    ...rest,
    rating: reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0,
  };
}

// GET ALL LISTINGS (paginated, published only, cached 60s)
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
        where: { published: true, approvalStatus: "APPROVED" },
        skip,
        take: limit,
        include: LISTING_INCLUDE,
      }),
      prisma.listing.count({ where: { published: true, approvalStatus: "APPROVED" } }),
    ]);

    const result = {
      data: listings.map(enrichRating),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };

    setCache(cacheKey, result, 60);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// SEARCH LISTINGS (FR-025, FR-027, FR-028)
export async function searchListings(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, parseInt(req.query.limit as string) || 10);
    const skip = (page - 1) * limit;

    const {
      location, type, minPrice, maxPrice, guests,
      checkIn, checkOut,
      amenities, instantBook, superhost,
      minRooms, minBathrooms,
    } = req.query;

    const where: Record<string, unknown> = { published: true, approvalStatus: "APPROVED" };

    if (location) where.location = { contains: location as string, mode: "insensitive" };
    if (type) where.type = type as string;
    if (minPrice || maxPrice) {
      const p: Record<string, number> = {};
      if (minPrice) p.gte = parseFloat(minPrice as string);
      if (maxPrice) p.lte = parseFloat(maxPrice as string);
      where.pricePerNight = p;
    }
    if (guests) where.guests = { gte: parseInt(guests as string) };
    if (instantBook === "true") where.instantBook = true;
    if (superhost === "true") where.superhost = true;
    if (minRooms) where.rooms = { gte: parseInt(minRooms as string) };
    if (minBathrooms) where.bathrooms = { gte: parseInt(minBathrooms as string) };
    if (amenities) {
      const list = (amenities as string).split(",").map((a) => a.trim()).filter(Boolean);
      if (list.length) where.amenities = { hasEvery: list };
    }

    // Date range conflict check (FR-025): exclude listings with overlapping confirmed/pending bookings
    if (checkIn && checkOut) {
      const ci = new Date(checkIn as string);
      const co = new Date(checkOut as string);
      const conflicting = await prisma.booking.findMany({
        where: {
          status: { in: ["PENDING", "CONFIRMED"] },
          checkIn: { lt: co },
          checkOut: { gt: ci },
        },
        select: { listingId: true },
        distinct: ["listingId"],
      });
      const conflictIds = conflicting.map((b) => b.listingId);

      // Also exclude listings with blocked dates in range
      const blocked = await prisma.blockedDate.findMany({
        where: {
          date: { gte: ci, lt: co },
        },
        select: { listingId: true },
        distinct: ["listingId"],
      });
      const blockedIds = blocked.map((b) => b.listingId);

      const excludeIds = [...new Set([...conflictIds, ...blockedIds])];
      if (excludeIds.length) {
        where.id = { notIn: excludeIds };
      }
    }

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        skip,
        take: limit,
        include: LISTING_INCLUDE,
      }),
      prisma.listing.count({ where }),
    ]);

    res.json({
      data: listings.map(enrichRating),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}

// HOST LISTINGS — all listings owned by authenticated host (FR-021: includes drafts)
export async function getHostListings(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const hostId = req.userId!;
    const listings = await prisma.listing.findMany({
      where: { hostId },
      include: LISTING_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    res.json(listings.map(enrichRating));
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
      prisma.listing.count({ where: { published: true, approvalStatus: "APPROVED" } }),
      prisma.listing.aggregate({ where: { published: true, approvalStatus: "APPROVED" }, _avg: { pricePerNight: true } }),
      prisma.listing.groupBy({ by: ["location"], where: { published: true, approvalStatus: "APPROVED" }, _count: { location: true } }),
      prisma.listing.groupBy({ by: ["type"], where: { published: true, approvalStatus: "APPROVED" }, _count: { type: true } }),
    ]);

    const result = { totalListings, averagePrice: avgPrice._avg.pricePerNight, byLocation, byType };
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

    const [listing, avgResult] = await Promise.all([
      prisma.listing.findUnique({
        where: { id },
        include: {
          host: { select: { id: true, name: true, avatar: true } },
          blockedDates: { select: { id: true, date: true } },
          bookings: {
            where: { status: { in: ["PENDING", "CONFIRMED"] } },
            select: { checkIn: true, checkOut: true, status: true },
          },
        },
      }),
      prisma.review.aggregate({
        where: { listingId: id },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

    if (!listing) return res.status(404).json({ message: "Listing not found" });
    res.json({ ...listing, rating: avgResult._avg.rating ?? 0, reviewCount: avgResult._count.rating });
  } catch (error) {
    next(error);
  }
}

// CREATE LISTING (FR-014, FR-015, FR-016, FR-017, FR-018, FR-021)
export async function createListing(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const {
      title, description, location, pricePerNight, guests, type, amenities,
      rooms, beds, bathrooms, photos, houseRules, checkInMethod, checkOutMethod,
      instantBook, cancellationPolicy,
      weekendPrice, weeklyDiscount, monthlyDiscount, extraGuestFee,
      cleaningFee, serviceFeePercent, taxPercent,
      minNights, maxNights, latitude, longitude, published,
    } = req.body;
    const hostId = req.userId!;
    const normalizedPhotos = await uploadDataImagePhotos(parseStringArray(photos) ?? []);
    const normalizedAmenities = parseStringArray(amenities) ?? [];
    const normalizedType = parseListingType(type);

    if (!title || !description || !location || !pricePerNight || !guests || !type) {
      return res.status(400).json({ message: "title, description, location, pricePerNight, guests, type are required" });
    }

    if (!normalizedType) {
      return res.status(400).json({ message: "type must be one of APARTMENT, HOUSE, VILLA, CABIN" });
    }

    const shouldPublish = parseBoolean(published);

    if (shouldPublish && normalizedPhotos.length < MIN_LISTING_PHOTOS) {
      return res.status(400).json({ message: `At least ${MIN_LISTING_PHOTOS} photos are required to publish a listing` });
    }

    const listing = await prisma.listing.create({
      data: {
        title, description, location,
        pricePerNight: Number(pricePerNight),
        guests: Number(guests),
        type: normalizedType,
        amenities: normalizedAmenities,
        photos: normalizedPhotos,
        rooms: rooms ? Number(rooms) : 1,
        beds: beds ? Number(beds) : 1,
        bathrooms: bathrooms ? Number(bathrooms) : 1,
        houseRules: houseRules ?? null,
        checkInMethod: checkInMethod ?? null,
        checkOutMethod: checkOutMethod ?? null,
        instantBook: parseBoolean(instantBook),
        cancellationPolicy: cancellationPolicy ?? "FLEXIBLE",
        weekendPrice: weekendPrice ? Number(weekendPrice) : null,
        weeklyDiscount: weeklyDiscount ? Number(weeklyDiscount) : 0,
        monthlyDiscount: monthlyDiscount ? Number(monthlyDiscount) : 0,
        extraGuestFee: extraGuestFee ? Number(extraGuestFee) : 0,
        cleaningFee: cleaningFee ? Number(cleaningFee) : 0,
        serviceFeePercent: serviceFeePercent != null ? Number(serviceFeePercent) : 14,
        taxPercent: taxPercent ? Number(taxPercent) : 0,
        minNights: minNights ? Number(minNights) : 1,
        maxNights: maxNights ? Number(maxNights) : null,
        latitude: latitude ? Number(latitude) : null,
        longitude: longitude ? Number(longitude) : null,
        published: false,
        approvalStatus: "PENDING",
        rejectionReason: null,
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

// UPDATE LISTING (FR-021: publish/draft, all other fields)
export async function updateListing(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const existing = await prisma.listing.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Listing not found" });
    if (existing.hostId !== req.userId && req.role !== "ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const {
      title, description, location, pricePerNight, guests, type, amenities,
      rooms, beds, bathrooms, photos, houseRules, checkInMethod, checkOutMethod,
      instantBook, cancellationPolicy,
      weekendPrice, weeklyDiscount, monthlyDiscount, extraGuestFee,
      cleaningFee, serviceFeePercent, taxPercent,
      minNights, maxNights, latitude, longitude, published,
    } = req.body;
    const normalizedPhotos = photos !== undefined
      ? await uploadDataImagePhotos(parseStringArray(photos) ?? [])
      : undefined;
    const normalizedAmenities = parseStringArray(amenities);
    const normalizedType = parseListingType(type);
    const uploadedFiles = listingUploadFiles(req);
    const uploadedPhotoUrls: string[] = [];
    const basePhotos = normalizedPhotos ?? existing.photos;

    if (normalizedType === null) {
      return res.status(400).json({ message: "type must be one of APARTMENT, HOUSE, VILLA, CABIN" });
    }

    if (basePhotos.length + uploadedFiles.length > MAX_LISTING_PHOTOS) {
      return res.status(400).json({ message: `A listing can have at most ${MAX_LISTING_PHOTOS} photos` });
    }

    for (const file of uploadedFiles) {
      const uploaded = await uploadToCloudinary(file.buffer, "airbnb/listings");
      uploadedPhotoUrls.push(uploaded.url);
    }

    const nextPhotos = normalizedPhotos !== undefined || uploadedPhotoUrls.length
      ? [...basePhotos, ...uploadedPhotoUrls]
      : existing.photos;
    const nextPublished = published !== undefined ? parseBoolean(published) : existing.published;
    const nextApprovalStatus = existing.approvalStatus === "REJECTED" ? "PENDING" : existing.approvalStatus;

    if (nextPublished && nextPhotos.length < MIN_LISTING_PHOTOS) {
      return res.status(400).json({ message: `At least ${MIN_LISTING_PHOTOS} photos are required to publish a listing` });
    }

    const updated = await prisma.listing.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(location !== undefined && { location }),
        ...(pricePerNight !== undefined && { pricePerNight: Number(pricePerNight) }),
        ...(guests !== undefined && { guests: Number(guests) }),
        ...(normalizedType !== undefined && { type: normalizedType }),
        ...(normalizedAmenities !== undefined && { amenities: normalizedAmenities }),
        ...(rooms !== undefined && { rooms: Number(rooms) }),
        ...(beds !== undefined && { beds: Number(beds) }),
        ...(bathrooms !== undefined && { bathrooms: Number(bathrooms) }),
        ...((normalizedPhotos !== undefined || uploadedPhotoUrls.length > 0) && { photos: nextPhotos }),
        ...(houseRules !== undefined && { houseRules }),
        ...(checkInMethod !== undefined && { checkInMethod }),
        ...(checkOutMethod !== undefined && { checkOutMethod }),
        ...(instantBook !== undefined && { instantBook: parseBoolean(instantBook) }),
        ...(cancellationPolicy !== undefined && { cancellationPolicy }),
        ...(weekendPrice !== undefined && { weekendPrice: weekendPrice ? Number(weekendPrice) : null }),
        ...(weeklyDiscount !== undefined && { weeklyDiscount: Number(weeklyDiscount) }),
        ...(monthlyDiscount !== undefined && { monthlyDiscount: Number(monthlyDiscount) }),
        ...(extraGuestFee !== undefined && { extraGuestFee: Number(extraGuestFee) }),
        ...(cleaningFee !== undefined && { cleaningFee: Number(cleaningFee) }),
        ...(serviceFeePercent !== undefined && { serviceFeePercent: Number(serviceFeePercent) }),
        ...(taxPercent !== undefined && { taxPercent: Number(taxPercent) }),
        ...(minNights !== undefined && { minNights: Number(minNights) }),
        ...(maxNights !== undefined && { maxNights: maxNights ? Number(maxNights) : null }),
        ...(latitude !== undefined && { latitude: latitude ? Number(latitude) : null }),
        ...(longitude !== undefined && { longitude: longitude ? Number(longitude) : null }),
        ...(published !== undefined && { published: nextApprovalStatus === "APPROVED" ? parseBoolean(published) : false }),
        ...(nextApprovalStatus !== existing.approvalStatus && { approvalStatus: nextApprovalStatus, rejectionReason: null }),
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
    if (existing.hostId !== req.userId && req.role !== "ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }
    await prisma.listing.delete({ where: { id } });
    deleteCacheByPrefix("listings:");
    deleteCacheByPrefix("stats:listings");
    res.json({ message: "Listing deleted successfully" });
  } catch (error) {
    next(error);
  }
}

// BLOCKED DATES (FR-018)
export async function getBlockedDates(req: Request, res: Response, next: NextFunction) {
  try {
    const listingId = req.params["id"] as string;
    const dates = await prisma.blockedDate.findMany({
      where: { listingId },
      orderBy: { date: "asc" },
    });
    res.json(dates);
  } catch (error) {
    next(error);
  }
}

export async function addBlockedDates(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const listingId = req.params["id"] as string;
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) return res.status(404).json({ message: "Listing not found" });
    if (listing.hostId !== req.userId) return res.status(403).json({ message: "Forbidden" });

    const { dates } = req.body as { dates: string[] };
    if (!Array.isArray(dates) || !dates.length) {
      return res.status(400).json({ message: "dates array required" });
    }

    const created = await prisma.$transaction(
      dates.map((d) =>
        prisma.blockedDate.upsert({
          where: { listingId_date: { listingId, date: new Date(d) } },
          create: { listingId, date: new Date(d) },
          update: {},
        })
      )
    );

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

export async function deleteBlockedDate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id: listingId, dateId } = req.params as { id: string; dateId: string };
    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) return res.status(404).json({ message: "Listing not found" });
    if (listing.hostId !== req.userId) return res.status(403).json({ message: "Forbidden" });

    await prisma.blockedDate.delete({ where: { id: dateId } });
    res.json({ message: "Blocked date removed" });
  } catch (error) {
    next(error);
  }
}

// WISHLIST (FR-032)
export async function getWishlist(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const items = await prisma.wishlistItem.findMany({
      where: { userId },
      include: {
        listing: {
          include: { reviews: { select: { rating: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(
      items.map((item) => ({
        ...item,
        listing: enrichRating(item.listing),
      }))
    );
  } catch (error) {
    next(error);
  }
}

export async function toggleWishlist(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const listingId = req.params["listingId"] as string;

    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const existing = await prisma.wishlistItem.findUnique({
      where: { userId_listingId: { userId, listingId } },
    });

    if (existing) {
      await prisma.wishlistItem.delete({ where: { id: existing.id } });
      return res.json({ saved: false });
    }

    await prisma.wishlistItem.create({ data: { userId, listingId } });
    res.json({ saved: true });
  } catch (error) {
    next(error);
  }
}

export async function getWishlistStatus(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const listingId = req.params["listingId"] as string;
    const item = await prisma.wishlistItem.findUnique({
      where: { userId_listingId: { userId, listingId } },
    });
    res.json({ saved: !!item });
  } catch (error) {
    next(error);
  }
}
