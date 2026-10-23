import { Router } from "express";
import { requireAuth } from "./auth.js";

export function createEventReadRouter(prisma) {
  const router = Router();

  router.get("/", requireAuth, async (req, res) => {
    const rawLimit = req.query.limit;
    const parsedLimit = typeof rawLimit === "string" && /^\d+$/.test(rawLimit)
      ? Number(rawLimit)
      : Number.NaN;
    const limit = Number.isSafeInteger(parsedLimit) && parsedLimit > 0
      ? Math.min(100, parsedLimit)
      : 30;
    try {
      const events = await prisma.event.findMany({
        where: { userId: req.auth.userId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          eventType: true,
          payload: true,
          status: true,
          idempotencyKey: true,
          createdAt: true,
          deliveries: {
            where: { endpoint: { userId: req.auth.userId } },
            select: { id: true, status: true, endpoint: { select: { id: true, name: true } } },
          },
        },
      });
      return res.json({
        events: events.map((event) => ({
          ...event,
          deliveryCount: event.deliveries.length,
          deliveredCount: event.deliveries.filter((delivery) => delivery.status === "DELIVERED").length,
          failedCount: event.deliveries.filter((delivery) => delivery.status === "FAILED").length,
        })),
      });
    } catch (error) {
      console.error("[events:list_error]", error);
      return res.status(500).json({ error: "event_list_failed", message: "Event history could not be loaded." });
    }
  });

  return router;
}
