import { Request, Response, NextFunction } from "express";
import prisma from "../config/prisma";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { sendEmail } from "../config/email";
import {
  welcomeEmail,
  passwordResetEmail,
  emailVerificationEmail,
  accountLockedEmail,
} from "../templates/emails";

// FR-003: password must be ≥8 chars, 1 uppercase, 1 digit, 1 special char
const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// ── Registration (FR-001/002/003) ────────────────────────────────────────────

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { name, email, username, phone, password, role } = req.body as {
      name: string; email: string; username: string; phone?: string; password: string; role?: string;
    };

    // FR-003: enforce password strength
    if (!PASSWORD_RE.test(password)) {
      return res.status(400).json({
        error: "Password must be at least 8 characters and include an uppercase letter, a digit, and a special character.",
      });
    }

    const hashed = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const user = await prisma.user.create({
      data: {
        name,
        email,
        username,
        phone: phone ?? "",
        password: hashed,
        role: (role as any) ?? "GUEST",
        emailVerificationToken: verificationToken,
      },
    });

    // FR-002: send verification email
    const frontendUrl = process.env["FRONTEND_URL"] ?? "http://localhost:5173";
    const verifyLink = `${frontendUrl}/verify-email/${verificationToken}`;
    try {
      await sendEmail(user.email, "Verify your email – ListOn", emailVerificationEmail(user.name, verifyLink));
    } catch (err) {
      console.error("Verification email failed:", err);
    }

    // Welcome email
    try {
      await sendEmail(user.email, "Welcome to ListOn", welcomeEmail(user.name, user.role));
    } catch (err) {
      console.error("Welcome email failed:", err);
    }

    const { password: _, emailVerificationToken: __, mfaSecret: ___, ...safe } = user;
    res.status(201).json({ ...safe, message: "Account created. Please verify your email." });
  } catch (error) {
    next(error);
  }
}

// FR-002: verify email
export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.params as { token: string };

    const user = await prisma.user.findFirst({
      where: { emailVerificationToken: token },
    });

    if (!user) return res.status(400).json({ error: "Invalid or expired verification link." });

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerificationToken: null },
    });

    res.json({ message: "Email verified successfully." });
  } catch (error) {
    next(error);
  }
}

// ── Login (FR-005/008) ────────────────────────────────────────────────────────

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const deviceName = (req.headers["x-device-name"] as string) || req.headers["user-agent"]?.slice(0, 80) || "Unknown device";
    const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "Invalid credentials." });

    // FR-005: check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      return res.status(423).json({
        error: `Account locked. Try again in ${remaining} minute${remaining !== 1 ? "s" : ""}.`,
        lockedUntil: user.lockedUntil,
      });
    }

    // FR-005: check banned/suspended
    if (user.banned) return res.status(403).json({ error: "Account permanently banned." });
    if (user.suspended) return res.status(403).json({ error: "Account suspended. Contact support." });

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      const newAttempts = user.loginAttempts + 1;
      const updates: Parameters<typeof prisma.user.update>[0]["data"] = { loginAttempts: newAttempts };

      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        updates.lockedUntil = lockUntil;
        updates.loginAttempts = 0;
        try {
          await sendEmail(user.email, "Account Locked – ListOn", accountLockedEmail(user.name, lockUntil.toLocaleString()));
        } catch {}
      }

      await prisma.user.update({ where: { id: user.id }, data: updates });
      const remaining = MAX_LOGIN_ATTEMPTS - newAttempts;
      return res.status(401).json({
        error: remaining > 0
          ? `Invalid credentials. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining before lockout.`
          : "Account locked for 30 minutes due to too many failed attempts.",
      });
    }

    // Successful login: reset lockout counter
    await prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null },
    });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env["JWT_SECRET"] as string,
      { expiresIn: "7d" }
    );

    // FR-008: create session record
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        deviceName,
        ipAddress,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({ token });
  } catch (error) {
    next(error);
  }
}

// ── Me ────────────────────────────────────────────────────────────────────────

export async function me(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { profile: true },
    });

    if (!user) return res.status(404).json({ error: "User not found" });
    const { password, mfaSecret, emailVerificationToken, ...safe } = user;
    res.json(safe);
  } catch (error) {
    next(error);
  }
}

// ── Password Reset (FR-006) ───────────────────────────────────────────────────

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body as { email: string };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ message: "If that email exists, a reset link has been sent." });

    const token = crypto.randomBytes(32).toString("hex");
    await prisma.user.update({
      where: { email },
      data: {
        resetToken: token,
        resetTokenExpiry: new Date(Date.now() + 30 * 60 * 1000), // FR-006: 30 minutes
      },
    });

    const frontendUrl = process.env["FRONTEND_URL"] ?? "http://localhost:5173";
    const link = `${frontendUrl}/reset-password/${token}`;

    try {
      await sendEmail(email, "Reset your password – ListOn", passwordResetEmail(user.name, link));
    } catch (e) {
      console.error(e);
    }

    res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { token } = req.params as { token: string };
    const { password } = req.body as { password: string };

    // FR-003: validate new password strength
    if (!PASSWORD_RE.test(password)) {
      return res.status(400).json({
        error: "Password must be at least 8 characters and include an uppercase letter, a digit, and a special character.",
      });
    }

    const user = await prisma.user.findFirst({
      where: { resetToken: token, resetTokenExpiry: { gt: new Date() } },
    });
    if (!user) return res.status(400).json({ error: "Invalid or expired reset token." });

    const hashed = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, resetToken: null, resetTokenExpiry: null, loginAttempts: 0, lockedUntil: null },
    });

    res.json({ message: "Password updated successfully." });
  } catch (error) {
    next(error);
  }
}

// ── FR-002: Resend verification email ────────────────────────────────────────

export async function resendVerification(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body as { email: string };
    const user = await prisma.user.findUnique({ where: { email } });

    // Always return 200 to avoid email enumeration
    if (!user || user.emailVerified) {
      return res.json({ message: "If that account exists and is unverified, a new link has been sent." });
    }

    let token = user.emailVerificationToken;
    if (!token) {
      token = crypto.randomBytes(32).toString("hex");
      await prisma.user.update({ where: { id: user.id }, data: { emailVerificationToken: token } });
    }

    const frontendUrl = process.env["FRONTEND_URL"] ?? "http://localhost:5173";
    const verifyLink = `${frontendUrl}/verify-email/${token}`;
    try {
      await sendEmail(user.email, "Verify your email – ListOn", emailVerificationEmail(user.name, verifyLink));
    } catch (err) {
      console.error("Resend verification email failed:", err);
    }

    res.json({ message: "If that account exists and is unverified, a new link has been sent." });
  } catch (error) {
    next(error);
  }
}

// ── FR-013: Switch Guest/Host mode ────────────────────────────────────────────

export async function switchRole(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { role } = req.body as { role: string };

    if (role !== "GUEST" && role !== "HOST") {
      return res.status(400).json({ error: "Can only switch between GUEST and HOST." });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, role: true } });
    if (!user) return res.status(404).json({ error: "User not found." });
    if (user.role === "ADMIN") return res.status(403).json({ error: "Admin accounts cannot switch roles." });

    const updated = await prisma.user.update({
      where: { id: req.userId },
      data: { role: role as any },
      select: { id: true, role: true },
    });

    const token = jwt.sign(
      { userId: updated.id, role: updated.role },
      process.env["JWT_SECRET"] as string,
      { expiresIn: "7d" }
    );

    res.json({ message: `Switched to ${role} mode.`, role: updated.role, token });
  } catch (error) {
    next(error);
  }
}
