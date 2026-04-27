import { Response, NextFunction } from "express";
import prisma from "../config/prisma";
import { BookingStatus } from "@prisma/client";
import type { AuthRequest } from "../middlewares/auth.middleware";

import { sendEmail } from "../config/email";
import {
  bookingConfirmationEmail,
  bookingCancellationEmail,
} from "../templates/emails";

//////////////////////////////////////////////////////////
// 📥 GET ALL BOOKINGS
//////////////////////////////////////////////////////////
export async function getAllBookings(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const bookings = await prisma.booking.findMany({
      include: {
        guest: { select: { name: true } },
        listing: { select: { title: true } },
      },
    });

    res.json(bookings);
  } catch (error) {
    next(error);
  }
}

//////////////////////////////////////////////////////////
// 📥 GET ONE BOOKING
//////////////////////////////////////////////////////////
export async function getBookingById(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const id = parseInt(req.params.id);

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        guest: true,
        listing: true,
      },
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.json(booking);
  } catch (error) {
    next(error);
  }
}

//////////////////////////////////////////////////////////
// ➕ CREATE BOOKING
//////////////////////////////////////////////////////////
export async function createBooking(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const { listingId, checkIn, checkOut } = req.body;

    // ❌ DO NOT trust guestId from body
    const guestId = req.userId;

    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
    });

    if (!listing) {
      return res.status(404).json({ message: "Listing not found" });
    }

    const start = new Date(checkIn);
    const end = new Date(checkOut);

    if (start >= end) {
      return res
        .status(400)
        .json({ message: "Invalid date range" });
    }

    // 💰 Calculate price
    const days = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );

    const totalPrice = days * listing.pricePerNight;

    const booking = await prisma.booking.create({
      data: {
        guestId,
        listingId,
        checkIn: start,
        checkOut: end,
        totalPrice,
        status: "PENDING",
      },
    });

    // 📧 SEND EMAIL
    const guest = await prisma.user.findUnique({
      where: { id: guestId },
    });

    try {
      await sendEmail(
        guest.email,
        "Booking Confirmed",
        bookingConfirmationEmail(
          guest.name,
          listing.title,
          listing.location,
          start.toDateString(),
          end.toDateString(),
          totalPrice
        )
      );
    } catch (err) {
      console.error("Email failed:", err);
    }

    res.status(201).json(booking);
  } catch (error) {
    next(error);
  }
}

//////////////////////////////////////////////////////////
// 🔄 UPDATE STATUS
//////////////////////////////////////////////////////////
export async function updateBookingStatus(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    if (!Object.values(BookingStatus).includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const booking = await prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      return res.status(404).json({ message: "Not found" });
    }

    // 🔐 Only owner or admin
    if (booking.guestId !== req.userId && req.role !== "ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
}

//////////////////////////////////////////////////////////
// ❌ DELETE BOOKING (CANCEL)
//////////////////////////////////////////////////////////
export async function deleteBooking(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const id = parseInt(req.params.id);

    const booking = await prisma.booking.findUnique({
      where: { id },
    });

    if (!booking) {
      return res.status(404).json({ message: "Not found" });
    }

    // 🔐 Only owner or admin
    if (booking.guestId !== req.userId && req.role !== "ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    const guest = await prisma.user.findUnique({
      where: { id: booking.guestId },
    });

    const listing = await prisma.listing.findUnique({
      where: { id: booking.listingId },
    });

    // 📧 SEND CANCEL EMAIL
    try {
      await sendEmail(
        guest.email,
        "Booking Cancelled",
        bookingCancellationEmail(
          guest.name,
          listing.title,
          booking.checkIn.toDateString(),
          booking.checkOut.toDateString()
        )
      );
    } catch (err) {
      console.error("Email failed:", err);
    }

    res.json({ message: "Booking cancelled" });
  } catch (error) {
    next(error);
  }
}