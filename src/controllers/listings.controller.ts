import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";

// Optional: type params for better TS safety
interface Params {
  id: string;
}

// =======================
// GET ALL LISTINGS
// =======================
export async function getAllListings(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const listings = await prisma.listing.findMany({
      include: {
        host: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            bookings: true,
          },
        },
      },
    });

    res.json(listings);
  } catch (error) {
    next(error);
  }
}

// =======================
// GET SINGLE LISTING
// =======================
export async function getListingById(
  req: Request<Params>,
  res: Response,
  next: NextFunction
) {
  try {
    const id = Number(req.params.id);

    if (!req.params.id || isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const listing = await prisma.listing.findUnique({
      where: { id },
      include: {
        host: {
          select: {
            id: true,
            name: true,
          },
        },
        bookings: {
          include: {
            guest: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    res.json(listing);
  } catch (error) {
    next(error);
  }
}

// =======================
// CREATE LISTING
// =======================
export async function createListing(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { title, description, price, location, hostId } = req.body;

    // Validation
    if (!title || !price || !hostId) {
      return res.status(400).json({
        message: "Title, price and hostId are required",
      });
    }

    const listing = await prisma.listing.create({
      data: {
        title,
        description,
        location,
        price: Number(price),
        host: {
          connect: { id: Number(hostId) },
        },
      },
    });

    res.status(201).json(listing);
  } catch (error) {
    next(error);
  }
}

// =======================
// UPDATE LISTING
// =======================
export async function updateListing(
  req: Request<Params>,
  res: Response,
  next: NextFunction
) {
  try {
    const id = Number(req.params.id);

    if (!req.params.id || isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const existing = await prisma.listing.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    const { title, description, price, location } = req.body;

    const updated = await prisma.listing.update({
      where: { id },
      data: {
        title,
        description,
        location,
        price: price ? Number(price) : undefined,
      },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
}

// =======================
// DELETE LISTING
// =======================
export async function deleteListing(
  req: Request<Params>,
  res: Response,
  next: NextFunction
) {
  try {
    const id = Number(req.params.id);

    if (!req.params.id || isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const existing = await prisma.listing.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    await prisma.listing.delete({
      where: { id },
    });

    res.json({ message: "Listing deleted successfully" });
  } catch (error) {
    next(error);
  }
}