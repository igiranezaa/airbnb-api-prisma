import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) 
{
  // 🔹 ZOD VALIDATION ERRORS
  if (err instanceof ZodError) {
    return res.status(400).json({
      errors: err.issues,
    });
  }

  // 🔹 PRISMA ERRORS
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        return res.status(409).json({
          error: "Resource already exists",
          field: err.meta?.target,
        });

      case "P2025":
        return res.status(404).json({
          error: "Record not found",
        });

      case "P2003":
        return res.status(400).json({
          error: "Invalid reference (foreign key constraint failed)",
        });

      default:
        return res.status(500).json({
          error: "Database error",
          code: err.code,
        });
    }
  }

  // 🔹 JWT / AUTH ERRORS (BONUS IMPROVEMENT)
  if (err instanceof Error && err.name === "JsonWebTokenError") {
    return res.status(401).json({
      error: "Invalid token",
    });
  }

  if (err instanceof Error && err.name === "TokenExpiredError") {
    return res.status(401).json({
      error: "Token expired",
    });
  }

  // 🔹 UNKNOWN ERRORS
  console.error("🔥 ERROR:", err);

  return res.status(500).json({
    error: "Something went wrong",
  });
}