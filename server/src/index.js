import "dotenv/config";
import cors from "cors";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { validateEventInput } from "./eventValidation.js";
import { createAuthRouter } from "./auth.js";
import { createEndpointRouter } from "./endpoints.js";
import { createDeliveryRouter } from "./deliveries.js";
import { createOverviewRouter } from "./overview.js";
import { createEventReadRouter } from "./eventRead.js";
import { requireAuth } from "./auth.js";
import { enqueueDelivery, pingRedis, closeDeliveryQueue } from "./deliveryQueue.js";
import { createRateLimiter } from "./rateLimit.js";

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 4000);
const eventIngestionRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req) => req.auth?.userId || req.ip || "unknown",
});

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "256kb" }));

app.use("/api/auth", createAuthRouter(prisma));
app.use("/api/endpoints", createEndpointRouter(prisma));
app.use("/api/deliveries", createDeliveryRouter(prisma));
app.use("/api/overview", createOverviewRouter(prisma));
app.use("/api/events", createEventReadRouter(prisma));

app.get("/api/health", async (_req, res) => {
  let database = "not_configured";
  let redis = "not_configured";
  if (process.env.DATABASE_URL) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "connected";
    } catch {
      database = "unavailable";
    }
  }
  if (process.env.REDIS_URL) {
    try { await pingRedis(); redis = "connected"; } catch { redis = "unavailable"; }
  }
  const healthy = database === "connected" && redis === "connected";
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    service: "webhookhub-api",
    database,
    redis,
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
      eventHistory: "GET /api/events (Bearer JWT)",
      endpoints: "GET /api/endpoints",
      deliveries: "GET /api/deliveries",
      overview: "GET /api/overview (Bearer JWT)",
      authentication: "POST /api/auth/register and POST /api/auth/login",
    },
  });
});

async function queuePendingDeliveries(eventId) {
  const now = new Date();
  const deliveries = await prisma.delivery.findMany({
    where: { eventId, status: { in: ["PENDING", "RETRYING"] } },
    select: { id: true, attemptCount: true, nextAttemptAt: true },
    take: 200,
    orderBy: { createdAt: "asc" },
  });
  const due = deliveries.filter((delivery) => !delivery.nextAttemptAt || delivery.nextAttemptAt <= now);
  const results = await Promise.all(due.map(async (delivery) => {
    try {
      await enqueueDelivery(delivery.id, 0, Math.max(1, delivery.attemptCount + 1));
      return true;
    } catch (error) {
      console.error("[api:queue_error]", { deliveryId: delivery.id, message: error?.message });
      return false;
    }
  }));
  const queued = results.filter(Boolean).length;
  const failed = results.length - queued;
  return { queued, failed };
}

app.post("/api/events", requireAuth, eventIngestionRateLimit, async (req, res) => {
  const headerKey = req.get("Idempotency-Key");
  const bodyKey = req.body?.idempotencyKey;
  const rawKey = headerKey ?? bodyKey;
  const idempotencyKey = typeof rawKey === "string" ? rawKey.trim() : rawKey;
  const validation = validateEventInput(req.body, idempotencyKey);

  if (!validation.ok) {
    return res.status(validation.status).json({ error: validation.error, message: validation.message });
  }
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: "database_not_configured", message: "Configure DATABASE_URL before ingesting events." });
  }

  try {
    let event;
    let duplicate = false;
    if (validation.value.idempotencyKey) {
      event = await prisma.event.findUnique({
        where: { userId_idempotencyKey: { userId: req.auth.userId, idempotencyKey: validation.value.idempotencyKey } },
        select: { id: true, eventType: true, status: true, createdAt: true },
      });
      duplicate = Boolean(event);
    }

    if (!event) {
      const endpoints = await prisma.endpoint.findMany({
        where: {
          userId: req.auth.userId,
          status: "ACTIVE",
          OR: [{ eventTypes: { isEmpty: true } }, { eventTypes: { has: validation.value.eventType } }],
        },
        select: { id: true },
      });

      event = await prisma.event.create({
        data: {
          eventType: validation.value.eventType,
          payload: validation.value.payload,
          idempotencyKey: validation.value.idempotencyKey,
          userId: req.auth.userId,
          status: endpoints.length ? "ACCEPTED" : "COMPLETED",
          deliveries: endpoints.length ? {
            create: endpoints.map((endpoint) => ({ endpointId: endpoint.id })),
          } : undefined,
        },
        select: { id: true, eventType: true, status: true, createdAt: true },
      });
    }

    const queueResult = await queuePendingDeliveries(event.id).catch((error) => {
      console.error("[api:queue_sweep_error]", error);
      return { queued: 0, failed: 1 };
    });

    return res.status(duplicate ? 200 : 202).json({
      event,
      duplicate,
      deliveryCount: await prisma.delivery.count({ where: { eventId: event.id } }),
      queue: queueResult.failed ? "degraded" : "queued",
      deliveriesQueued: queueResult.queued,
      ...(queueResult.failed ? { warning: "Event stored, but one or more deliveries could not be queued. The worker recovery sweep will retry queueing." } : {}),
    });
  } catch (error) {
    if (error?.code === "P2002" && validation.value.idempotencyKey) {
      try {
        const existing = await prisma.event.findUnique({
          where: { userId_idempotencyKey: { userId: req.auth.userId, idempotencyKey: validation.value.idempotencyKey } },
          select: { id: true, eventType: true, status: true, createdAt: true },
        });
        if (existing) {
          const queueResult = await queuePendingDeliveries(existing.id).catch(() => ({ queued: 0, failed: 1 }));
          return res.status(200).json({ event: existing, duplicate: true, ...queueResult, queue: queueResult.failed ? "degraded" : "queued" });
        }
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
    await closeDeliveryQueue().catch((error) => console.error("[api:redis_shutdown_error]", error));
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
