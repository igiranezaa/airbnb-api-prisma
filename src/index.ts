import "dotenv/config";
import http from "http";
import express, { Request, Response } from "express";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { connectDB } from "./config/prisma";
import { swaggerSpec } from "./config/swagger";
import { generalLimiter, strictLimiter } from "./middlewares/rateLimiter";
import { deprecateV1 } from "./middlewares/deprecation.middleware";
import { errorHandler } from "./middlewares/errorHandler";

import v1Router from "./routes/v1/index";

const app = express();
const PORT = Number(process.env["PORT"]) || 3000;

// CORS — allow origins from env var (comma-separated) or fallback to localhost
const rawOrigins = process.env["ALLOWED_ORIGINS"] ?? "http://localhost:5173";
const allowedOrigins = rawOrigins.split(",").map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // allow server-to-server requests (no origin) and listed origins
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

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

// ROOT
app.get("/", (_req: Request, res: Response) => {
  res.json({
    name: "ListOn API",
    version: "1.0.0",
    status: "running",
    docs: "/api-docs",
    health: "/health",
    base: "/api/v1",
  });
});

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
app.use(errorHandler);

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
