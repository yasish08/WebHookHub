import { Router } from "express";
import { requireAuth } from "./auth.js";
import { enqueueDelivery } from "./deliveryQueue.js";

const DELIVERY_STATUSES = new Set(["PENDING", "PROCESSING", "DELIVERED", "RETRYING", "FAILED"]);

export function createDeliveryRouter(prisma) {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    const requestedStatus = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "";
    const status = DELIVERY_STATUSES.has(requestedStatus) ? requestedStatus : undefined;
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 30;

    try {
      const deliveries = await prisma.delivery.findMany({
        where: {
          endpoint: { userId: req.auth.userId },
          ...(status ? { status } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          status: true,
          attemptCount: true,
          responseStatus: true,
          responseBody: true,
          errorMessage: true,
          durationMs: true,
          nextAttemptAt: true,
          deliveredAt: true,
          createdAt: true,
          updatedAt: true,
          event: { select: { id: true, eventType: true, createdAt: true, payload: true } },
          endpoint: { select: { id: true, name: true, url: true } },
          _count: { select: { attempts: true } },
        },
      });
      return res.json({ deliveries });
    } catch (error) {
      console.error("[deliveries:list_error]", error);
      return res.status(500).json({ error: "delivery_list_failed", message: "Delivery history could not be loaded." });
    }
  });

  router.get("/:id/attempts", async (req, res) => {
    try {
      const delivery = await prisma.delivery.findFirst({
        where: { id: req.params.id, endpoint: { userId: req.auth.userId } },
        select: { id: true },
      });
      if (!delivery) return res.status(404).json({ error: "delivery_not_found", message: "Delivery not found." });

      const attempts = await prisma.deliveryAttempt.findMany({
        where: { deliveryId: delivery.id },
        orderBy: { attemptNumber: "asc" },
        select: {
          id: true,
          attemptNumber: true,
          responseStatus: true,
          responseBody: true,
          errorMessage: true,
          durationMs: true,
          createdAt: true,
        },
      });
      return res.json({ deliveryId: delivery.id, attempts });
    } catch (error) {
      console.error("[deliveries:attempts_error]", error);
      return res.status(500).json({ error: "delivery_attempts_failed", message: "Delivery attempts could not be loaded." });
    }
  });

  router.post("/:id/replay", async (req, res) => {
    try {
      const original = await prisma.delivery.findFirst({
        where: { id: req.params.id, endpoint: { userId: req.auth.userId } },
        select: { id: true, eventId: true, endpointId: true, endpoint: { select: { status: true } } },
      });
      if (!original) return res.status(404).json({ error: "delivery_not_found", message: "Delivery not found." });
      if (original.endpoint.status !== "ACTIVE") {
        return res.status(409).json({ error: "endpoint_paused", message: "Activate the endpoint before replaying this delivery." });
      }

      const replay = await prisma.delivery.create({
        data: { eventId: original.eventId, endpointId: original.endpointId },
        select: { id: true, status: true, createdAt: true },
      });
      let queue = "queued";
      try {
        await enqueueDelivery(replay.id, 0, 1);
      } catch (error) {
        queue = "degraded";
        console.error("[deliveries:replay_queue_error]", { deliveryId: replay.id, message: error?.message });
      }
      return res.status(202).json({
        delivery: replay,
        queue,
        message: queue === "queued" ? "Replay queued." : "Replay saved and will be picked up by worker recovery when Redis is available.",
      });
    } catch (error) {
      console.error("[deliveries:replay_error]", error);
      return res.status(500).json({ error: "delivery_replay_failed", message: "The delivery could not be replayed." });
    }
  });

  return router;
}
