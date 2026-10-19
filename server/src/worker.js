import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Worker } from "bullmq";
import { getRedisConnection, DELIVERY_QUEUE_NAME, enqueueDelivery, closeDeliveryQueue } from "./deliveryQueue.js";
import { validateEndpointUrl } from "./endpointSecurity.js";
import { decryptEndpointSecret } from "./secretCrypto.js";
import {
  calculateRetryDelay,
  createWebhookSignature,
  DELIVERY_TIMEOUT_MS,
  MAX_DELIVERY_ATTEMPTS,
  shouldRetryStatus,
  truncateResponseBody,
} from "./webhookHelpers.js";

const prisma = new PrismaClient();
const port = Number(process.env.WORKER_CONCURRENCY || 8);

async function processDelivery(job) {
  const { deliveryId } = job.data;
  const delivery = await prisma.delivery.findUnique({
    where: { id: deliveryId },
    include: { event: true, endpoint: true },
  });
  if (!delivery || ["DELIVERED", "FAILED"].includes(delivery.status)) return { skipped: true };

  if (delivery.endpoint.status !== "ACTIVE") {
    await prisma.delivery.update({
      where: { id: delivery.id },
      data: { status: "RETRYING", errorMessage: "Endpoint is paused; delivery is waiting for activation.", nextAttemptAt: null },
    });
    return { skipped: true, reason: "endpoint_paused" };
  }

  const attemptNumber = delivery.attemptCount + 1;
  await prisma.delivery.update({
    where: { id: delivery.id },
    data: { status: "PROCESSING", attemptCount: attemptNumber, errorMessage: null, nextAttemptAt: null },
  });

  const startedAt = Date.now();
  let responseStatus = null;
  let responseBody = "";
  let errorMessage = null;
  let succeeded = false;

  try {
    // Re-check the destination at send time and refuse redirects. This blocks
    // common SSRF vectors; network-level egress controls are still recommended
    // because DNS can theoretically change between validation and connection.
    const safeUrl = await validateEndpointUrl(delivery.endpoint.url);
    if (!safeUrl.ok) throw new Error(`Destination rejected at delivery time: ${safeUrl.message}`);

    const secret = decryptEndpointSecret(delivery.endpoint.secret);
    const rawBody = JSON.stringify({
      id: delivery.event.id,
      type: delivery.event.eventType,
      createdAt: delivery.event.createdAt.toISOString(),
      data: delivery.event.payload,
    });
    const signed = createWebhookSignature(rawBody, secret);
    const response = await fetch(safeUrl.value, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "WebHookHub/1.0",
        "X-WebhookHub-Event": delivery.event.id,
        "X-WebhookHub-Event-Type": delivery.event.eventType,
        "X-WebhookHub-Delivery": delivery.id,
        "X-WebhookHub-Signature": signed.signature,
        "X-WebhookHub-Timestamp": String(signed.timestamp),
        "X-WebhookHub-Attempt": String(attemptNumber),
      },
      body: rawBody,
    });
    responseStatus = response.status;
    responseBody = truncateResponseBody(await response.text().catch(() => ""));
    succeeded = response.ok;
    if (!succeeded) errorMessage = `Endpoint returned HTTP ${response.status}`;
  } catch (error) {
    errorMessage = error?.name === "TimeoutError" || error?.name === "AbortError"
      ? `Request timed out after ${DELIVERY_TIMEOUT_MS}ms`
      : (error?.message || "Delivery failed");
  }

  const durationMs = Date.now() - startedAt;
  const canRetry = !succeeded && attemptNumber < MAX_DELIVERY_ATTEMPTS &&
    (responseStatus === null || shouldRetryStatus(responseStatus));

  await prisma.$transaction(async (tx) => {
    await tx.deliveryAttempt.create({
      data: {
        deliveryId: delivery.id,
        attemptNumber,
        responseStatus,
        responseBody,
        errorMessage,
        durationMs,
      },
    });
    await tx.delivery.update({
      where: { id: delivery.id },
      data: {
        status: succeeded ? "DELIVERED" : canRetry ? "RETRYING" : "FAILED",
        responseStatus,
        responseBody,
        errorMessage: succeeded ? null : errorMessage,
        durationMs,
        deliveredAt: succeeded ? new Date() : null,
        nextAttemptAt: canRetry ? new Date(Date.now() + calculateRetryDelay(attemptNumber)) : null,
      },
    });
  });

  if (canRetry) {
    const delay = calculateRetryDelay(attemptNumber);
    await enqueueDelivery(delivery.id, delay, attemptNumber + 1);
  }

  console.log(JSON.stringify({
    event: "webhook_delivery_attempt",
    deliveryId: delivery.id,
    endpointId: delivery.endpointId,
    attemptNumber,
    status: succeeded ? "DELIVERED" : canRetry ? "RETRYING" : "FAILED",
    responseStatus,
    durationMs,
  }));
  return { deliveryId: delivery.id, succeeded, retryScheduled: canRetry, attemptNumber };
}

const worker = new Worker(DELIVERY_QUEUE_NAME, processDelivery, {
  connection: getRedisConnection(),
  concurrency: Number.isInteger(port) && port > 0 && port <= 64 ? port : 8,
});

worker.on("completed", (job, result) => {
  if (result?.skipped) console.log(`[worker] skipped ${job.id}: ${result.reason || "already completed"}`);
});
worker.on("failed", (job, error) => {
  console.error("[worker:job_error]", job?.id, error);
});

console.log(`[webhookhub-worker] listening on queue ${DELIVERY_QUEUE_NAME} (concurrency ${port})`);

let recoveryRunning = false;
async function recoverPendingDeliveries() {
  if (recoveryRunning || shuttingDown) return;
  recoveryRunning = true;
  try {
    const now = new Date();
    const staleBefore = new Date(Date.now() - 60_000);
    await prisma.delivery.updateMany({
      where: { status: "PROCESSING", updatedAt: { lt: staleBefore } },
      data: { status: "PENDING", errorMessage: "Recovered after worker interruption." },
    });
    const due = await prisma.delivery.findMany({
      where: {
        status: { in: ["PENDING", "RETRYING"] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      select: { id: true, attemptCount: true },
      take: 200,
      orderBy: { createdAt: "asc" },
    });
    for (const delivery of due) {
      try {
        await enqueueDelivery(delivery.id, 0, Math.max(1, delivery.attemptCount + 1));
      } catch (error) {
        console.error("[worker:recovery_enqueue_error]", { deliveryId: delivery.id, message: error?.message });
        break;
      }
    }
    if (due.length) console.log(`[worker] recovery sweep checked ${due.length} due deliveries`);
  } catch (error) {
    console.error("[worker:recovery_error]", error);
  } finally {
    recoveryRunning = false;
  }
}
void recoverPendingDeliveries();
const recoveryTimer = setInterval(() => void recoverPendingDeliveries(), 30_000);
recoveryTimer.unref();

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[webhookhub-worker] ${signal} received; shutting down`);
  clearInterval(recoveryTimer);
  await worker.close();
  await closeDeliveryQueue();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
