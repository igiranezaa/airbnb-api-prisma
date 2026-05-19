import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import multer from "multer";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) 
{
  // 🔹 BODY PARSE ERRORS (invalid JSON sent by client)
  if (err instanceof SyntaxError && "status" in err && (err as unknown as Record<string, unknown>)["status"] === 400) {
    return res.status(400).json({ error: "Invalid JSON in request body" });
  }

  if (
    err instanceof Error &&
    "status" in err &&
    (err as unknown as Record<string, unknown>)["status"] === 413
  ) {
    return res.status(413).json({
      error: "Request body is too large. Upload fewer or smaller photos.",
    });
  }

  // 🔹 ZOD VALIDATION ERRORS
  if (err instanceof ZodError) {
    return res.status(400).json({
      errors: err.issues,
    });
  }

  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE"
      ? "Image must be 20MB or smaller"
      : err.code === "LIMIT_UNEXPECTED_FILE"
        ? "Upload at most 100 photos using the images field"
        : err.message;

    return res.status(400).json({ error: message });
  }

  if (err instanceof Error && err.message.includes("Only jpeg")) {
    return res.status(400).json({ error: err.message });
  }

  if (err instanceof Error && err.message.includes("Missing Cloudinary configuration")) {
    return res.status(500).json({
      error: "Photo upload is not configured on the server. Add the Cloudinary environment variables on Render and redeploy.",
    });
  }

  if (err instanceof Error && err.message.toLowerCase().includes("cloudinary")) {
    return res.status(502).json({
      error: "Photo upload failed on Cloudinary. Please try again.",
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
