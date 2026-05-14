import { Response, NextFunction } from "express";
import prisma from "../config/prisma";
import type { AuthRequest } from "../middlewares/auth.middleware";

// FR-009: Get profile
export async function getProfile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = (req.params["id"] as string) || req.userId!;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, username: true, role: true,
        avatar: true, bio: true, emailVerified: true, createdAt: true,
        profile: true,
      },
    });

    if (!user) return res.status(404).json({ error: "User not found." });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

// FR-009: Update profile (name, bio, avatar, languages, contact preferences)
export async function updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.userId!;
    const { name, bio, avatar, languages, contactPreferences, country, website } = req.body as {
      name?: string; bio?: string; avatar?: string;
      languages?: string[]; contactPreferences?: object;
      country?: string; website?: string;
    };

    const userUpdate = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(bio !== undefined && { bio }),
        ...(avatar !== undefined && { avatar }),
      },
      select: { id: true, name: true, bio: true, avatar: true, role: true },
    });

    // Upsert profile with extended fields
    const profile = await prisma.profile.upsert({
      where: { userId: id },
      create: {
        userId: id,
        languages: languages ?? [],
        contactPreferences: contactPreferences ?? {},
        country: country ?? null,
        website: website ?? null,
      },
      update: {
        ...(languages !== undefined && { languages }),
        ...(contactPreferences !== undefined && { contactPreferences }),
        ...(country !== undefined && { country }),
        ...(website !== undefined && { website }),
      },
    });

    res.json({ ...userUpdate, profile });
  } catch (err) {
    next(err);
  }
}

// FR-011: Export user data (GDPR Art. 17)
export async function exportUserData(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.userId!;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        bookings: { include: { listing: { select: { title: true, location: true } } } },
        listings: true,
        reviews: true,
        sentMessages: { select: { id: true, content: true, createdAt: true } },
      },
    });

    if (!user) return res.status(404).json({ error: "User not found." });

    const { password, mfaSecret, emailVerificationToken, resetToken, ...safe } = user;
    res.setHeader("Content-Disposition", `attachment; filename="my-data-${Date.now()}.json"`);
    res.setHeader("Content-Type", "application/json");
    res.json(safe);
  } catch (err) {
    next(err);
  }
}

// FR-011: Request account deletion
export async function requestAccountDeletion(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const id = req.userId!;
    const { confirmText } = req.body as { confirmText: string };

    if (confirmText !== "DELETE MY ACCOUNT") {
      return res.status(400).json({ error: 'Please type "DELETE MY ACCOUNT" to confirm.' });
    }

    await prisma.user.delete({ where: { id } });
    res.json({ message: "Account permanently deleted. All data has been removed." });
  } catch (err) {
    next(err);
  }
}
