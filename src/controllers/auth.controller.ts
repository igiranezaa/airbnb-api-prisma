import { Request, Response } from "express";
import prisma from "../config/prisma";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { AuthRequest } from "../middlewares/auth.middleware";

import { sendEmail } from "../config/email";
import {
  welcomeEmail,
  passwordResetEmail,
} from "../templates/emails";

export async function register(req: Request, res: Response) {
  const { name, email, username, phone, password, role } = req.body;

  const hashed = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { name, email, username, phone, password: hashed, role },
  });

  try {
    await sendEmail(
      user.email,
      "Welcome",
      welcomeEmail(user.name, user.role)
    );
  } catch (err) {
    console.error(err);
  }

  const { password: _, ...safe } = user;
  res.status(201).json(safe);
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env["JWT_SECRET"] as string,
    { expiresIn: "7d" }
  );

  res.json({ token });
}

export async function me(req: AuthRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
  });

  if (!user) return res.status(404).json({ error: "User not found" });
  const { password, ...safe } = user;
  res.json(safe);
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.json({ message: "If exists, email sent" });

  const token = crypto.randomBytes(32).toString("hex");

  await prisma.user.update({
    where: { email },
    data: {
      resetToken: token,
      resetTokenExpiry: new Date(Date.now() + 3600000),
    },
  });

  const link = `${process.env["API_URL"]}/auth/reset-password/${token}`;

  try {
    await sendEmail(
      email,
      "Reset Password",
      passwordResetEmail(user.name, link)
    );
  } catch (e) {}

  res.json({ message: "Email sent" });
}

export async function resetPassword(req: Request, res: Response) {
  const token = req.params["token"] as string;
  const { password } = req.body;

  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpiry: { gt: new Date() },
    },
  });

  if (!user) return res.status(400).json({ error: "Invalid token" });

  const hashed = await bcrypt.hash(password, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashed,
      resetToken: null,
      resetTokenExpiry: null,
    },
  });

  res.json({ message: "Password updated" });
}
