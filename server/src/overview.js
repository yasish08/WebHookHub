import { Router } from "express";
import { requireAuth } from "./auth.js";

function relativeTime(value) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (elapsed < 60_000) return "Just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} hr ago`;
  return new Date(value).toLocaleDateString();
}

export function createOverviewRouter(prisma) {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    const userId = req.auth.userId;
    const deliveryScope = { endpoint: { userId } };

    try {
      const [
        endpointCount,
        activeEndpointCount,
        eventCount,
        deliveredCount,
        retryCount,
        failedCount,
        pendingCount,
        averageDuration,
        endpoints,
        deliveries,
      ] = await Promise.all([
        prisma.endpoint.count({ where: { userId } }),
        prisma.endpoint.count({ where: { userId, status: "ACTIVE" } }),
        prisma.event.count({ where: { deliveries: { some: { endpoint: { userId } } } } }),
        prisma.delivery.count({ where: { ...deliveryScope, status: "DELIVERED" } }),
        prisma.delivery.count({ where: { ...deliveryScope, status: "RETRYING" } }),
        prisma.delivery.count({ where: { ...deliveryScope, status: "FAILED" } }),
        prisma.delivery.count({ where: { ...deliveryScope, status: { in: ["PENDING", "PROCESSING"] } } }),
        prisma.delivery.aggregate({ where: { ...deliveryScope, durationMs: { not: null } }, _avg: { durationMs: true } }),
        prisma.endpoint.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 4,
          select: { id: true, name: true, url: true, status: true, eventTypes: true, _count: { select: { deliveries: true } } },
        }),
        prisma.delivery.findMany({
          where: deliveryScope,
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true, status: true, responseStatus: true, errorMessage: true, durationMs: true, createdAt: true,
            event: { select: { eventType: true } },
            endpoint: { select: { id: true, name: true, url: true, status: true } },
          },
        }),
      ]);

      const totalFinished = deliveredCount + failedCount;
      return res.json({
        metrics: {
          endpointCount,
          activeEndpointCount,
          eventCount,
          deliveredCount,
          retryCount,
          failedCount,
          pendingCount,
          successRate: totalFinished ? Math.round((deliveredCount / totalFinished) * 1000) / 10 : 0,
          averageDurationMs: averageDuration._avg.durationMs === null ? null : Math.round(averageDuration._avg.durationMs),
        },
        endpoints,
        recentDeliveries: deliveries.map((delivery) => ({
          ...delivery,
          timeLabel: relativeTime(delivery.createdAt),
          latencyLabel: delivery.durationMs === null ? "—" : `${delivery.durationMs} ms`,
        })),
      });
    } catch (error) {
      console.error("[overview:load_error]", error);
      return res.status(500).json({ error: "overview_failed", message: "Dashboard metrics could not be loaded." });
    }
  });

  return router;
}
