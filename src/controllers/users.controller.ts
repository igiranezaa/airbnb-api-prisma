import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";

// Extend Request to include userId (from auth middleware)
interface AuthRequest extends Request {
  userId?: number;
}

interface Params {
  id: string;
}

// =======================
// GET ALL USERS
// =======================
export async function getAllUsers(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const users = await prisma.user.findMany({
      include: {
        _count: { select: { listings: true } },
      },
    });

    // 🔐 remove passwords
    const safeUsers = users.map(({ password, ...rest }) => rest);

    res.json(safeUsers);
  } catch (error) {
    next(error);
  }
}

// =======================
// GET USER BY ID (ROLE-BASED)
// =======================
export async function getUserById(
  req: Request<Params>,
  res: Response,
  next: NextFunction
) {
  try {
    const id = Number(req.params.id);

    if (!req.params.id || isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, password: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // =======================
    // HOST → include listings
    // =======================
    if (user.role === "HOST") {
      const host = await prisma.user.findUnique({
        where: { id },
        include: {
          listings: {
            include: {
              _count: { select: { bookings: true } },
            },
          },
        },
      });

      if (!host) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password, ...safeHost } = host;
      return res.json(safeHost);
    }

    // =======================
    // GUEST → include bookings
    // =======================
    const guest = await prisma.user.findUnique({
      where: { id },
      include: {
        bookings: {
          include: {
            listing: {
              select: {
                title: true,
                location: true,
                price: true,
              },
            },
          },
        },
      },
    });

    if (!guest) {
      return res.status(404).json({ message: "User not found" });
    }

    const { password, ...safeGuest } = guest;
    res.json(safeGuest);
  } catch (error) {
    next(error);
  }
}

// =======================
// UPDATE USER (OWNER ONLY)
// =======================
export async function updateUser(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const id = Number(req.params.id);

    if (!req.params.id || isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    // 🔐 ownership check
    if (!req.userId || req.userId !== id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const existing = await prisma.user.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ message: "User not found" });
    }

    const { name, email, username } = req.body;

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name,
        email,
        username,
      },
    });

    const { password, ...safeUser } = updated;
    res.json(safeUser);
  } catch (error) {
    next(error);
  }
}

// =======================
// DELETE USER (OWNER ONLY)
// =======================
export async function deleteUser(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const id = Number(req.params.id);

    if (!req.params.id || isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    // 🔐 ownership check
    if (!req.userId || req.userId !== id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const existing = await prisma.user.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ message: "User not found" });
    }

    await prisma.user.delete({ where: { id } });

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    next(error);
  }
}

// =======================
// USER LISTINGS
// =======================
export async function getUserListings(
  req: Request<Params>,
  res: Response,
  next: NextFunction
) {
  try {
    const id = Number(req.params.id);

    if (!req.params.id || isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const listings = await prisma.listing.findMany({
      where: { hostId: id },
      include: {
        _count: { select: { bookings: true } },
      },
    });

    res.json(listings);
  } catch (error) {
    next(error);
  }
}

// =======================
// USER BOOKINGS
// =======================
export async function getUserBookings(
  req: Request<Params>,
  res: Response,
  next: NextFunction
) {
  try {
    const id = Number(req.params.id);

    if (!req.params.id || isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const bookings = await prisma.booking.findMany({
      where: { guestId: id },
      include: {
        listing: {
          select: {
            title: true,
            location: true,
          },
        },
      },
    });

    res.json(bookings);
  } catch (error) {
    next(error);
  }
}