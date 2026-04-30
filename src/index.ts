import "dotenv/config";
import http from "http";
import express, { Request, Response, NextFunction } from "express";
import compression from "compression";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { connectDB } from "./config/prisma";
import { swaggerSpec } from "./config/swagger";
import { generalLimiter, strictLimiter } from "./middlewares/rateLimiter";
import { deprecateV1 } from "./middlewares/deprecation.middleware";

import v1Router from "./routes/v1/index";

const app = express();
const PORT = Number(process.env["PORT"]) || 3000;

// REQUEST LOGGING
app.use(process.env["NODE_ENV"] === "production" ? morgan("combined") : morgan("dev"));

// COMPRESSION
app.use(compression());

// BODY PARSING
app.use(express.json());

// RATE LIMITING
app.use(generalLimiter);
app.use("/v1/auth", strictLimiter);
app.use("/v1/bookings", strictLimiter);

// HEALTH CHECK
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date() });
});

// SWAGGER
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// VERSIONED ROUTES
app.use("/v1", deprecateV1, v1Router);
app.use("/api/v1", v1Router);

// 404
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

// GLOBAL ERROR HANDLER
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong" });
});

async function main() {
  await connectDB();

  const server = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      resolve();
    });
  });
}

main();
