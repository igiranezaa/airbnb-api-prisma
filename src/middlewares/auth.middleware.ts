import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

// 🔐 Extend Request type
export interface AuthRequest extends Request {
  userId?: string;
  role?: string;
}

// ✅ AUTHENTICATE USER (JWT)
export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  // 1. Check header exists
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    // 2. Extract token
    const token = authHeader.split(" ")[1];

    // 3. Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as { userId: string; role: string };

    // 4. Attach user info to request
    req.userId = decoded.userId;
    req.role = decoded.role;

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

// ✅ REQUIRE HOST (or ADMIN)
export function requireHost(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (req.role !== "HOST" && req.role !== "ADMIN") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

// ✅ REQUIRE GUEST (or ADMIN)
export function requireGuest(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (req.role !== "GUEST" && req.role !== "ADMIN") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

// ✅ REQUIRE ADMIN ONLY
export function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (req.role !== "ADMIN") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}