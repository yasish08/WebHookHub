import { Queue } from "bullmq";
import IORedis from "ioredis";

export const DELIVERY_QUEUE_NAME = "webhook-deliveries";

let redisConnection;
let deliveryQueue;

export function getRedisConnection() {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required.");
  if (!redisConnection) redisConnection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  return redisConnection;
}

export function getDeliveryQueue() {
  if (!deliveryQueue) deliveryQueue = new Queue(DELIVERY_QUEUE_NAME, { connection: getRedisConnection() });
  return deliveryQueue;
}

export async function enqueueDelivery(deliveryId, delay = 0, attemptNumber = 1) {
  if (!deliveryId) throw new TypeError("A delivery ID is required.");
  return getDeliveryQueue().add("deliver", { deliveryId }, {
    jobId: `delivery-${deliveryId}-attempt-${attemptNumber}`,
    delay: Math.max(0, Math.floor(delay)),
  });
}

export async function pingRedis() {
  return getRedisConnection().ping();
}

export async function closeDeliveryQueue() {
  if (deliveryQueue) {
    await deliveryQueue.close();
    deliveryQueue = undefined;
  }
  if (redisConnection) {
    const connection = redisConnection;
    redisConnection = undefined;
    await connection.quit();
  }
}
