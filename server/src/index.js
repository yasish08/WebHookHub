import "dotenv/config";
import cors from "cors";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { validateEventInput } from "./eventValidation.js";
import { createAuthRouter } from "./auth.js";
import { createEndpointRouter } from "./endpoints.js";

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 4000);

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "256kb" }));

app.use("/api/auth", createAuthRouter(prisma));
app.use("/api/endpoints", createEndpointRouter(prisma));

app.get("/api/health", async (_req, res) => {
  let database = "not_configured";
  if (process.env.DATABASE_URL) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "connected";
    } catch {
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
    routes: {
      health: "GET /api/health",
      ingestEvent: "POST /api/events",
    },
  });
});

app.post("/api/events", async (req, res) => {
  const headerKey = req.get("Idempotency-Key");
  const bodyKey = typeof req.body?.idempotencyKey === "string" ? req.body.idempotencyKey : undefined;
  const rawKey = headerKey ?? bodyKey;
  const idempotencyKey = typeof rawKey === "string" ? rawKey.trim() : undefined;
  const validation = validateEventInput(req.body, idempotencyKey);

  if (!validation.ok) {
    return res.status(validation.status).json({
      error: validation.error,
      message: validation.message,
    });
  }

  if (!process.env.DATABASE_URL) {
    return res.status(503).json({
      error: "database_not_configured",
      message: "Configure DATABASE_URL before ingesting events.",
    });
  }

  try {
    if (validation.value.idempotencyKey) {
      const existing = await prisma.event.findUnique({
        where: { idempotencyKey: validation.value.idempotencyKey },
        select: { id: true, eventType: true, status: true, createdAt: true },
      });
      if (existing) {
        return res.status(200).json({ event: existing, duplicate: true });
      }
    }

    const event = await prisma.event.create({
      data: validation.value,
      select: { id: true, eventType: true, status: true, createdAt: true },
    });
    return res.status(202).json({ event, duplicate: false });
  } catch (error) {
    // Concurrent requests can race after the lookup. A unique-key conflict is
    // treated as an idempotent replay instead of creating a second event.
    if (error?.code === "P2002" && validation.value.idempotencyKey) {
      try {
        const existing = await prisma.event.findUnique({
          where: { idempotencyKey: validation.value.idempotencyKey },
          select: { id: true, eventType: true, status: true, createdAt: true },
        });
        if (existing) return res.status(200).json({ event: existing, duplicate: true });
      } catch (lookupError) {
        console.error("[api:idempotency_lookup_error]", lookupError);
      }
    }

    console.error("[api:event_ingestion_error]", error);
    return res.status(500).json({
      error: "event_ingestion_failed",
      message: "The event could not be stored. Please retry with the same Idempotency-Key.",
    });
  }
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
