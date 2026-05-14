import { Response, NextFunction } from "express";
import prisma from "../config/prisma";
import type { AuthRequest } from "../middlewares/auth.middleware";

async function logAction(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  before?: object | null,
  after?: object | null
) {
  await prisma.auditLog.create({
    data: {
      adminId,
      action,
      targetType,
      targetId,
      before: before ?? undefined,
      after: after ?? undefined,
    },
  });
}

// ── FR-069: User Management ──────────────────────────────────────────────────

export async function adminGetAllUsers(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, name: true, email: true, username: true, role: true,
        suspended: true, banned: true, createdAt: true,
        _count: { select: { bookings: true, listings: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
}

export async function adminUpdateUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as { id: string };
    const { name, email, username, role } = req.body as {
      name?: string; email?: string; username?: string; role?: string;
    };

    const before = await prisma.user.findUnique({
      where: { id },
      select: { name: true, email: true, username: true, role: true },
    });
    if (!before) return res.status(404).json({ message: "User not found" });

    const updated = await prisma.user.update({
      where: { id },
      data: { ...(name && { name }), ...(email && { email }), ...(username && { username }), ...(role && { role: role as any }) },
      select: { id: true, name: true, email: true, username: true, role: true, suspended: true, banned: true },
    });

    await logAction(req.userId!, "UPDATE_USER", "user", id, before, {
      name: updated.name, email: updated.email, username: updated.username, role: updated.role,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function adminSuspendUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, suspended: true, name: true } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const updated = await prisma.user.update({
      where: { id },
      data: { suspended: !user.suspended },
      select: { id: true, suspended: true },
    });

    await logAction(req.userId!, updated.suspended ? "SUSPEND_USER" : "UNSUSPEND_USER", "user", id,
      { suspended: user.suspended }, { suspended: updated.suspended });

    res.json({ message: updated.suspended ? "User suspended" : "User unsuspended", suspended: updated.suspended });
  } catch (err) {
    next(err);
  }
}

export async function adminBanUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, banned: true } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const updated = await prisma.user.update({
      where: { id },
      data: { banned: true, suspended: true },
      select: { id: true, banned: true, suspended: true },
    });

    await logAction(req.userId!, "BAN_USER", "user", id, { banned: false }, { banned: true });

    res.json({ message: "User permanently banned", banned: updated.banned });
  } catch (err) {
    next(err);
  }
}

export async function adminDeleteUser(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as { id: string };

    if (id === req.userId) {
      return res.status(403).json({ message: "You cannot delete your own account." });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    await logAction(req.userId!, "DELETE_USER", "user", id, user, null);
    await prisma.user.delete({ where: { id } });

    res.json({ message: "User deleted" });
  } catch (err) {
    next(err);
  }
}

// ── FR-070: Refunds & Coupons ────────────────────────────────────────────────

export async function adminIssueRefund(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { bookingId, amount, reason } = req.body as {
      bookingId: string; amount: number; reason?: string;
    };

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, totalPrice: true, status: true, refundAmount: true },
    });
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    const refundAmt = Math.min(amount, booking.totalPrice);
    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        refundAmount: refundAmt,
        status: refundAmt >= booking.totalPrice ? "CANCELLED" : booking.status,
      },
    });

    await logAction(req.userId!, "ISSUE_REFUND", "booking", bookingId,
      { refundAmount: booking.refundAmount, status: booking.status },
      { refundAmount: refundAmt, status: updated.status, reason });

    res.json({ message: "Refund issued", refundAmount: refundAmt, booking: updated });
  } catch (err) {
    next(err);
  }
}

export async function adminIssueCoupon(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { userId, amount, code, expiresAt } = req.body as {
      userId?: string; amount: number; code: string; expiresAt?: string;
    };

    const coupon = await prisma.coupon.create({
      data: {
        code,
        amount,
        issuedById: req.userId!,
        ...(userId && { userId }),
        ...(expiresAt && { expiresAt: new Date(expiresAt) }),
      },
    });

    await logAction(req.userId!, "ISSUE_COUPON", "coupon", coupon.id, null,
      { code, amount, userId: userId ?? null });

    res.status(201).json(coupon);
  } catch (err) {
    next(err);
  }
}

export async function adminGetCoupons(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const coupons = await prisma.coupon.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        issuedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(coupons);
  } catch (err) {
    next(err);
  }
}

// ── FR-071: Dispute Resolution ───────────────────────────────────────────────

export async function getDisputes(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { status } = req.query as { status?: string };
    const disputes = await prisma.dispute.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        raisedBy: { select: { id: true, name: true, email: true } },
        booking: {
          select: {
            id: true, totalPrice: true, status: true,
            listing: { select: { title: true, location: true } },
            guest: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(disputes);
  } catch (err) {
    next(err);
  }
}

export async function createDispute(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { bookingId, reason } = req.body as { bookingId: string; reason: string };

    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true } });
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    const dispute = await prisma.dispute.create({
      data: { bookingId, raisedById: req.userId!, reason },
    });
    res.status(201).json(dispute);
  } catch (err) {
    next(err);
  }
}

export async function updateDisputeStatus(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as { id: string };
    const { status, resolution } = req.body as { status: string; resolution?: string };

    const before = await prisma.dispute.findUnique({ where: { id }, select: { status: true, resolution: true } });
    if (!before) return res.status(404).json({ message: "Dispute not found" });

    const updated = await prisma.dispute.update({
      where: { id },
      data: { status: status as any, ...(resolution !== undefined && { resolution }) },
    });

    await logAction(req.userId!, "UPDATE_DISPUTE", "dispute", id,
      { status: before.status, resolution: before.resolution },
      { status: updated.status, resolution: updated.resolution });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function addEvidence(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as { id: string };
    const { evidenceUrl } = req.body as { evidenceUrl: string };

    const dispute = await prisma.dispute.findUnique({ where: { id }, select: { evidence: true } });
    if (!dispute) return res.status(404).json({ message: "Dispute not found" });

    const updated = await prisma.dispute.update({
      where: { id },
      data: { evidence: [...dispute.evidence, evidenceUrl] },
    });

    await logAction(req.userId!, "ADD_EVIDENCE", "dispute", id, null, { evidenceUrl });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

// ── FR-072: Audit Logs ───────────────────────────────────────────────────────

export async function getAuditLogs(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"))));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        skip, take: limit,
        include: { admin: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.auditLog.count(),
    ]);

    res.json({ data: logs, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
}

// ── FR-073: Admin Dashboard Stats ────────────────────────────────────────────

export async function getAdminDashboardStats(_req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      gmvResult,
      activeBookings,
      openDisputes,
      recentCancellations,
      totalUsers,
      totalListings,
    ] = await Promise.all([
      prisma.booking.aggregate({ _sum: { totalPrice: true }, where: { status: "CONFIRMED" } }),
      prisma.booking.count({ where: { status: "CONFIRMED", checkOut: { gte: now } } }),
      prisma.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
      prisma.booking.count({ where: { status: "CANCELLED", createdAt: { gte: yesterday } } }),
      prisma.user.count(),
      prisma.listing.count(),
    ]);

    const gmv = gmvResult._sum.totalPrice ?? 0;
    res.json({
      gmv,
      activeBookings,
      fraudAlerts: openDisputes,
      recentCancellations,
      supportTickets: openDisputes,
      platformUptime: "99.9%",
      totalUsers,
      totalListings,
    });
  } catch (err) {
    next(err);
  }
}
