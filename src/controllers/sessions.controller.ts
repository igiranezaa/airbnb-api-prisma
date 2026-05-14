import { Response, NextFunction } from "express";
import crypto from "crypto";
import prisma from "../config/prisma";
import type { AuthRequest } from "../middlewares/auth.middleware";

// FR-008: List all sessions for current user
export async function getSessions(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const sessions = await prisma.session.findMany({
      where: { userId: req.userId!, expiresAt: { gt: new Date() } },
      select: { id: true, deviceName: true, ipAddress: true, createdAt: true, lastActive: true, expiresAt: true },
      orderBy: { lastActive: "desc" },
    });

    // Mark which session is current by matching token hash from Authorization header
    const authHeader = req.headers.authorization ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const currentHash = token ? crypto.createHash("sha256").update(token).digest("hex") : null;

    const withCurrent = await Promise.all(
      sessions.map(async (s) => {
        const full = await prisma.session.findUnique({ where: { id: s.id }, select: { tokenHash: true } });
        return { ...s, isCurrent: full?.tokenHash === currentHash };
      })
    );

    res.json(withCurrent);
  } catch (err) {
    next(err);
  }
}

// FR-008: Revoke a specific session
export async function revokeSession(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params as { sessionId: string };

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return res.status(404).json({ error: "Session not found." });
    if (session.userId !== req.userId) return res.status(403).json({ error: "Forbidden." });

    await prisma.session.delete({ where: { id: sessionId } });
    res.json({ message: "Session revoked." });
  } catch (err) {
    next(err);
  }
}

// FR-008: Revoke all other sessions
export async function revokeAllOtherSessions(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const currentHash = token ? crypto.createHash("sha256").update(token).digest("hex") : null;

    const deleted = await prisma.session.deleteMany({
      where: {
        userId: req.userId!,
        ...(currentHash ? { tokenHash: { not: currentHash } } : {}),
      },
    });

    res.json({ message: `${deleted.count} session(s) revoked.` });
  } catch (err) {
    next(err);
  }
}
