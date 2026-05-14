import { Response, NextFunction } from "express";
import prisma from "../config/prisma";
import type { AuthRequest } from "../middlewares/auth.middleware";

// FR-012: Get notification preferences
export async function getNotificationPrefs(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const prefs = await prisma.notificationPreference.upsert({
      where: { userId: req.userId! },
      create: { userId: req.userId! },
      update: {},
    });
    res.json(prefs);
  } catch (err) {
    next(err);
  }
}

// FR-012: Update notification preferences
export async function updateNotificationPrefs(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { emailBookings, emailMessages, emailMarketing, pushEnabled, smsEnabled } = req.body as {
      emailBookings?: boolean; emailMessages?: boolean; emailMarketing?: boolean;
      pushEnabled?: boolean; smsEnabled?: boolean;
    };

    const prefs = await prisma.notificationPreference.upsert({
      where: { userId: req.userId! },
      create: {
        userId: req.userId!,
        ...(emailBookings !== undefined && { emailBookings }),
        ...(emailMessages !== undefined && { emailMessages }),
        ...(emailMarketing !== undefined && { emailMarketing }),
        ...(pushEnabled !== undefined && { pushEnabled }),
        ...(smsEnabled !== undefined && { smsEnabled }),
      },
      update: {
        ...(emailBookings !== undefined && { emailBookings }),
        ...(emailMessages !== undefined && { emailMessages }),
        ...(emailMarketing !== undefined && { emailMarketing }),
        ...(pushEnabled !== undefined && { pushEnabled }),
        ...(smsEnabled !== undefined && { smsEnabled }),
      },
    });

    res.json(prefs);
  } catch (err) {
    next(err);
  }
}
