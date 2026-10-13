import "dotenv/config";
import cors from "cors";
import express from "express";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 4000);

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "256kb" }));

app.get("/api/health", async (_req, res) => {
  let database = "not_configured";
  if (process.env.DATABASE_URL) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "connected";
    } catch (error) {
      database = "unavailable";
    }
  }
  const healthy = database === "connected";
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    service: "webhookhub-api",
    database,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api", (_req, res) => {
  res.json({
    name: "WebHookHub API",
    version: "1.0.0",
    message: "Reliable webhook delivery starts here.",
    health: "/api/health",
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "not_found", message: `No route for ${req.method} ${req.path}` });
});

app.use((error, _req, res, _next) => {
  console.error("[api:error]", error);
  res.status(error.status || 500).json({
    error: "internal_error",
    message: process.env.NODE_ENV === "production" ? "An unexpected error occurred." : error.message,
  });
});

const server = app.listen(port, () => {
  console.log(`[webhookhub-api] listening on http://localhost:${port}`);
});

async function shutdown(signal) {
  console.log(`[webhookhub-api] ${signal} received; shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
