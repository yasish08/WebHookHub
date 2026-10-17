import { Queue } from "bullmq";
import IORedis from "ioredis";

export const DELIVERY_QUEUE_NAME = "webhook-deliveries";
