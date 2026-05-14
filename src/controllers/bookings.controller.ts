import { Response, NextFunction } from "express";
import prisma from "../config/prisma";
import { BookingStatus } from "@prisma/client";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { sendEmail } from "../config/email";
import {
  bookingConfirmationEmail,
  bookingCancellationEmail,
} from "../templates/emails";

// Refund percentage by cancellation policy (FR-037)
function refundPercent(policy: string, checkIn: Date): number {
  const daysUntilCheckIn = Math.max(0, (checkIn.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  switch (policy) {
    case "FLEXIBLE":        return daysUntilCheckIn >= 1 ? 100 : 0;
    case "MODERATE":        return daysUntilCheckIn >= 5 ? 100 : daysUntilCheckIn >= 1 ? 50 : 0;
    case "STRICT":          return daysUntilCheckIn >= 14 ? 100 : daysUntilCheckIn >= 7 ? 50 : 0;
    case "NON_REFUNDABLE":  return 0;
    case "LONG_TERM":       return daysUntilCheckIn >= 30 ? 100 : 0;
    default:                return 0;
  }
}

// Full price breakdown (FR-030)
function computePrice(params: {
  checkIn: Date;
  checkOut: Date;
  guestCount: number;
  pricePerNight: number;
  weekendPrice?: number | null;
  weeklyDiscount: number;
  monthlyDiscount: number;
  extraGuestFee: number;
  cleaningFee: number;
  serviceFeePercent: number;
  taxPercent: number;
  guests: number; // max guests for extra guest fee threshold
}) {
  const {
    checkIn, checkOut, guestCount,
    pricePerNight, weekendPrice,
    weeklyDiscount, monthlyDiscount, extraGuestFee,
    cleaningFee, serviceFeePercent, taxPercent, guests,
  } = params;

  let nightlyTotal = 0;
  const cursor = new Date(checkIn);
  while (cursor < checkOut) {
    const isWeekend = cursor.getDay() === 0 || cursor.getDay() === 6;
    nightlyTotal += isWeekend && weekendPrice ? weekendPrice : pricePerNight;
    cursor.setDate(cursor.getDate() + 1);
  }

  const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
  if (nights >= 28 && monthlyDiscount > 0) {
    nightlyTotal *= 1 - monthlyDiscount / 100;
  } else if (nights >= 7 && weeklyDiscount > 0) {
    nightlyTotal *= 1 - weeklyDiscount / 100;
  }

  // Extra guest fee for guests beyond listing capacity
  const extraGuests = Math.max(0, guestCount - guests);
  const extraFee = extraGuests * extraGuestFee * nights;

  const subtotal = nightlyTotal + extraFee;
  const serviceFee = Math.round((subtotal * serviceFeePercent) / 100 * 100) / 100;
  const taxes = Math.round((subtotal * taxPercent) / 100 * 100) / 100;
  const totalPrice = Math.round((subtotal + cleaningFee + serviceFee + taxes) * 100) / 100;

  return { nightlyTotal: Math.round(nightlyTotal * 100) / 100, cleaningFee, serviceFee, taxes, totalPrice };
}

// GET ALL BOOKINGS (paginated)
export async function getAllBookings(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1);
    const limit = Math.max(1, parseInt(String(req.query.limit)) || 10);
    const skip = (page - 1) * limit;

    const view = String(req.query.view ?? "").toLowerCase();

    // Admins see all; hosts see bookings for their listings; guests see their own bookings.
    // The explicit host view is used by the host dashboard so received bookings do
    // not disappear if local UI role state and the JWT role drift.
    const where =
      view === "host" ? { listing: { hostId: req.userId } } :
      view === "guest" ? { guestId: req.userId } :
      req.role === "ADMIN" ? {} :
      req.role === "HOST"  ? { listing: { hostId: req.userId } } :
      { guestId: req.userId };

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: limit,
        include: {
          guest: { select: { name: true, email: true } },
          listing: { select: { title: true, location: true, hostId: true, photos: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({ data: bookings, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    next(error);
  }
}

// GET ONE BOOKING
export async function getBookingById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        guest: { select: { id: true, name: true, email: true } },
        listing: {
          include: { host: { select: { id: true, name: true, email: true } } },
        },
        modifications: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    const isOwner = booking.guestId === req.userId || booking.listing.hostId === req.userId;
    if (!isOwner && req.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });

    res.json(booking);
  } catch (error) {
    next(error);
  }
}

// CREATE BOOKING (FR-033, FR-034, FR-030)
export async function createBooking(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { listingId, checkIn, checkOut, guestCount: rawGuests } = req.body;
    const guestId = req.userId!;

    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) return res.status(404).json({ message: "Listing not found" });
    if (!listing.published) return res.status(400).json({ message: "Listing not available" });

    const start = new Date(checkIn);
    const end = new Date(checkOut);
    if (start >= end) return res.status(400).json({ message: "Invalid date range" });

    const nights = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    // FR-018: min/max nights validation
    if (nights < listing.minNights) {
      return res.status(400).json({ message: `Minimum stay is ${listing.minNights} night(s)` });
    }
    if (listing.maxNights && nights > listing.maxNights) {
      return res.status(400).json({ message: `Maximum stay is ${listing.maxNights} night(s)` });
    }

    const guestCount = rawGuests ? Number(rawGuests) : 1;
    if (guestCount > listing.guests) {
      return res.status(400).json({ message: `Listing accommodates max ${listing.guests} guests` });
    }

    // Check for conflicting bookings
    const conflict = await prisma.booking.findFirst({
      where: {
        listingId,
        status: { in: ["PENDING", "CONFIRMED"] },
        checkIn: { lt: end },
        checkOut: { gt: start },
      },
    });
    if (conflict) return res.status(409).json({ message: "These dates are already booked" });

    // Check blocked dates
    const blocked = await prisma.blockedDate.findFirst({
      where: { listingId, date: { gte: start, lt: end } },
    });
    if (blocked) return res.status(409).json({ message: "Some dates are blocked by the host" });

    // FR-030: full price breakdown
    const priceBreakdown = computePrice({
      checkIn: start, checkOut: end, guestCount,
      pricePerNight: listing.pricePerNight,
      weekendPrice: listing.weekendPrice,
      weeklyDiscount: listing.weeklyDiscount,
      monthlyDiscount: listing.monthlyDiscount,
      extraGuestFee: listing.extraGuestFee,
      cleaningFee: listing.cleaningFee,
      serviceFeePercent: listing.serviceFeePercent,
      taxPercent: listing.taxPercent,
      guests: listing.guests,
    });

    // FR-033/FR-034: instant book → CONFIRMED; else PENDING with 24h expiry
    const status = listing.instantBook ? "CONFIRMED" : "PENDING";
    const expiresAt = listing.instantBook ? null : new Date(Date.now() + 24 * 60 * 60 * 1000);

    const booking = await prisma.booking.create({
      data: {
        guestId, listingId,
        checkIn: start, checkOut: end,
        guestCount,
        nightlyTotal: priceBreakdown.nightlyTotal,
        cleaningFee: priceBreakdown.cleaningFee,
        serviceFee: priceBreakdown.serviceFee,
        taxes: priceBreakdown.taxes,
        totalPrice: priceBreakdown.totalPrice,
        status,
        expiresAt,
      },
    });

    const guest = await prisma.user.findUnique({ where: { id: guestId } });
    if (guest) {
      try {
        await sendEmail(
          guest.email,
          listing.instantBook ? "Booking Confirmed" : "Booking Request Sent",
          bookingConfirmationEmail(
            guest.name, listing.title, listing.location,
            start.toDateString(), end.toDateString(), priceBreakdown.totalPrice
          )
        );
      } catch { /* non-fatal */ }
    }

    res.status(201).json(booking);
  } catch (error) {
    next(error);
  }
}

// UPDATE BOOKING STATUS — host can CONFIRM or CANCEL a PENDING booking (FR-034/FR-038)
export async function updateBookingStatus(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const { status, rejectionReason } = req.body;

    if (!Object.values(BookingStatus).includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { listing: { select: { hostId: true } } },
    });
    if (!booking) return res.status(404).json({ message: "Not found" });

    const isGuest = booking.guestId === req.userId;
    const isHost  = booking.listing.hostId === req.userId;
    const isAdmin = req.role === "ADMIN";

    if (!isGuest && !isHost && !isAdmin) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // FR-034: only host (or admin) can CONFIRM; guest can cancel
    if (status === "CONFIRMED" && !isHost && !isAdmin) {
      return res.status(403).json({ message: "Only the host can confirm a booking" });
    }

    const data: { status: BookingStatus; rejectionReason?: string } = { status };
    if (status === "CANCELLED" && rejectionReason) {
      data.rejectionReason = String(rejectionReason).slice(0, 500);
    }
    const updated = await prisma.booking.update({ where: { id }, data });
    res.json(updated);
  } catch (error) {
    next(error);
  }
}

// DELETE (CANCEL) BOOKING — auto-computes refund (FR-037, FR-038)
export async function deleteBooking(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { listing: { select: { hostId: true, cancellationPolicy: true } } },
    });
    if (!booking) return res.status(404).json({ message: "Not found" });

    const isGuest = booking.guestId === req.userId;
    const isHost  = booking.listing.hostId === req.userId;
    if (!isGuest && !isHost && req.role !== "ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const pct = refundPercent(booking.listing.cancellationPolicy, booking.checkIn);
    const refundAmount = Math.round(booking.totalPrice * pct) / 100;

    await prisma.booking.update({ where: { id }, data: { status: "CANCELLED", refundAmount } });

    const [guest, listing] = await Promise.all([
      prisma.user.findUnique({ where: { id: booking.guestId } }),
      prisma.listing.findUnique({ where: { id: booking.listingId } }),
    ]);
    if (guest && listing) {
      try {
        await sendEmail(
          guest.email,
          "Booking Cancelled",
          bookingCancellationEmail(
            guest.name, listing.title,
            booking.checkIn.toDateString(), booking.checkOut.toDateString()
          )
        );
      } catch { /* non-fatal */ }
    }

    res.json({ message: "Booking cancelled", refundAmount });
  } catch (error) {
    next(error);
  }
}

// BOOKING RECEIPT (FR-040)
export async function getBookingReceipt(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        guest: { select: { id: true, name: true, email: true } },
        listing: {
          include: { host: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    const isOwner = booking.guestId === req.userId || booking.listing.hostId === req.userId;
    if (!isOwner && req.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });

    const nights = Math.round(
      (booking.checkOut.getTime() - booking.checkIn.getTime()) / (1000 * 60 * 60 * 24)
    );

    res.json({
      bookingRef: booking.id.slice(0, 8).toUpperCase(),
      booking,
      nights,
      breakdown: {
        nightlyTotal: booking.nightlyTotal,
        cleaningFee: booking.cleaningFee,
        serviceFee: booking.serviceFee,
        taxes: booking.taxes,
        total: booking.totalPrice,
        refundAmount: booking.refundAmount,
      },
    });
  } catch (error) {
    next(error);
  }
}

// MODIFICATION REQUESTS (FR-039)
export async function getModifications(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: { listing: { select: { hostId: true } } },
    });
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    const isOwner = booking.guestId === req.userId || booking.listing.hostId === req.userId;
    if (!isOwner && req.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });

    const mods = await prisma.modificationRequest.findMany({
      where: { bookingId: id },
      orderBy: { createdAt: "desc" },
    });
    res.json(mods);
  } catch (error) {
    next(error);
  }
}

export async function createModification(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const bookingId = req.params["id"] as string;
    const guestId = req.userId!;
    const { requestedCheckIn, requestedCheckOut, requestedGuestCount, note } = req.body;

    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.guestId !== guestId) return res.status(403).json({ message: "Forbidden" });
    if (booking.status !== "CONFIRMED") {
      return res.status(400).json({ message: "Can only modify confirmed bookings" });
    }

    const mod = await prisma.modificationRequest.create({
      data: {
        bookingId,
        guestId,
        requestedCheckIn: new Date(requestedCheckIn),
        requestedCheckOut: new Date(requestedCheckOut),
        requestedGuestCount: requestedGuestCount ? Number(requestedGuestCount) : booking.guestCount,
        note: note ?? null,
      },
    });
    res.status(201).json(mod);
  } catch (error) {
    next(error);
  }
}

export async function respondToModification(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id: bookingId, modId } = req.params as { id: string; modId: string };
    const { status } = req.body as { status: "APPROVED" | "DECLINED" };

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { listing: { select: { hostId: true } } },
    });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.listing.hostId !== req.userId && req.role !== "ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const mod = await prisma.modificationRequest.findUnique({ where: { id: modId } });
    if (!mod || mod.bookingId !== bookingId) return res.status(404).json({ message: "Modification not found" });
    if (mod.status !== "PENDING") return res.status(400).json({ message: "Already responded" });

    const updated = await prisma.modificationRequest.update({
      where: { id: modId },
      data: { status, respondedAt: new Date() },
    });

    if (status === "APPROVED") {
      await prisma.booking.update({
        where: { id: bookingId },
        data: {
          checkIn: mod.requestedCheckIn,
          checkOut: mod.requestedCheckOut,
          guestCount: mod.requestedGuestCount,
        },
      });
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
}

// AUTO-EXPIRE stale PENDING bookings (called on-demand or via cron)
export async function expireBookings(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await prisma.booking.updateMany({
      where: { status: "PENDING", expiresAt: { lt: new Date() } },
      data: { status: "EXPIRED" },
    });
    res.json({ expired: result.count });
  } catch (error) {
    next(error);
  }
}
