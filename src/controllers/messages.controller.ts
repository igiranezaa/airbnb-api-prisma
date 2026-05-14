import { Response, NextFunction } from "express";
import prisma from "../config/prisma";
import type { AuthRequest } from "../middlewares/auth.middleware";

export async function getMessages(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { bookingId, listingId } = req.query;
    if (!bookingId && !listingId) return res.status(400).json({ error: "bookingId or listingId required" });

    const userId = req.userId!;

    if (bookingId) {
      const booking = await prisma.booking.findUnique({
        where: { id: String(bookingId) },
        include: { listing: { select: { hostId: true } } },
      });
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.guestId !== userId && booking.listing.hostId !== userId && req.role !== "ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
      }
      const messages = await prisma.message.findMany({
        where: { bookingId: String(bookingId) },
        include: { sender: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "asc" },
      });
      return res.json(messages);
    }

    // Enquiry thread — anyone can read if they are the sender or the listing host
    const listing = await prisma.listing.findUnique({ where: { id: String(listingId) } });
    if (!listing) return res.status(404).json({ error: "Listing not found" });

    const messages = await prisma.message.findMany({
      where: {
        listingId: String(listingId),
        bookingId: null,
        OR: [{ senderId: userId }, { listing: { hostId: userId } }],
      },
      include: { sender: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json(messages);
  } catch (error) {
    next(error);
  }
}

export async function sendMessage(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { bookingId, listingId, content, imageUrl } = req.body;
    if (!content?.trim() && !imageUrl) return res.status(400).json({ error: "content or imageUrl is required" });
    if (!bookingId && !listingId) return res.status(400).json({ error: "bookingId or listingId required" });

    const userId = req.userId!;

    if (bookingId) {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { listing: { select: { hostId: true } } },
      });
      if (!booking) return res.status(404).json({ error: "Booking not found" });
      if (booking.guestId !== userId && booking.listing.hostId !== userId && req.role !== "ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
      }
    } else {
      const listing = await prisma.listing.findUnique({ where: { id: listingId } });
      if (!listing) return res.status(404).json({ error: "Listing not found" });
    }

    const message = await prisma.message.create({
      data: {
        bookingId: bookingId ?? null,
        listingId: listingId ?? null,
        senderId: userId,
        content: content?.trim() ?? "",
        imageUrl: imageUrl ?? null,
      },
      include: { sender: { select: { id: true, name: true, role: true } } },
    });

    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
}
