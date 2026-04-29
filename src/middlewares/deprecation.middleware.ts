import type { Request, Response, NextFunction } from "express";

export function deprecateV1(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Deprecation", "true");
  res.setHeader("Sunset", "Sat, 01 Jan 2026 00:00:00 GMT");
  res.setHeader("Link", '</v2>; rel="successor-version"');
  next();
}
