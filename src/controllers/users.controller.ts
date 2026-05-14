import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import { getCache, setCache } from "../config/cache";
import type { AuthRequest } from "../middlewares/auth.middleware";

// GET ALL USERS
export async function getAllUsers(_req: Request, res: Response, next: NextFunction) {
  try {
    const users = await prisma.user.findMany({
      include: { _count: { select: { listings: true } } },
    });
    const safeUsers = users.map(({ password, ...rest }) => rest);
    res.json(safeUsers);
  } catch (error) {
    next(error);
  }
}

// USER STATS (cached 5 min)
export async function getUserStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const cacheKey = "stats:users";
    const cached = getCache(cacheKey);
    if (cached) return res.json(cached);

    const [totalUsers, byRole] = await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({ by: ["role"], _count: { role: true } }),
    ]);

    const result = { totalUsers, byRole };
    setCache(cacheKey, result, 5 * 60);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// GET USER BY ID (role-based response)
export async function getUserById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, password: true },
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role === "HOST") {
      const host = await prisma.user.findUnique({
        where: { id },
        include: {
          listings: { include: { _count: { select: { bookings: true } } } },
        },
      });
      if (!host) return res.status(404).json({ message: "User not found" });
      const { password, ...safeHost } = host;
      return res.json(safeHost);
    }

    const guest = await prisma.user.findUnique({
      where: { id },
      include: {
        bookings: {
          include: {
            listing: { select: { title: true, location: true, pricePerNight: true } },
          },
        },
      },
    });
    if (!guest) return res.status(404).json({ message: "User not found" });
    const { password, ...safeGuest } = guest;
    res.json(safeGuest);
  } catch (error) {
    next(error);
  }
}

// UPDATE USER
export async function updateUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;

    if (!req.userId || req.userId !== id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "User not found" });

    const { name, email, username } = req.body;
    const updated = await prisma.user.update({ where: { id }, data: { name, email, username } });
    const { password, ...safeUser } = updated;
    res.json(safeUser);
  } catch (error) {
    next(error);
  }
}

// DELETE USER
export async function deleteUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;

    if (!req.userId || (req.userId !== id && req.role !== "ADMIN")) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "User not found" });

    await prisma.user.delete({ where: { id } });
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    next(error);
  }
}

// USER LISTINGS
export async function getUserListings(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;

    const listings = await prisma.listing.findMany({
      where: { hostId: id },
      include: { _count: { select: { bookings: true } } },
    });
    res.json(listings);
  } catch (error) {
    next(error);
  }
}

// USER BOOKINGS (paginated)
export async function getUserBookings(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;

    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.max(1, parseInt(String(req.query.limit)) || 10);
    const skip = (page - 1) * limit;

    const userExists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!userExists) return res.status(404).json({ message: "User not found" });

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where: { guestId: id },
        skip,
        take: limit,
        include: {
          listing: { select: { title: true, location: true } },
        },
      }),
      prisma.booking.count({ where: { guestId: id } }),
    ]);

    res.json({
      data: bookings,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    next(error);
  }
}
