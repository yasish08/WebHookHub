import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import IORedis from "ioredis";

const enabled = process.env.RUN_INTEGRATION_TESTS === "1";
const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;

test("PostgreSQL + Redis API integration: register, endpoint, idempotent ingest and queue", {
  skip: !enabled ? "Set RUN_INTEGRATION_TESTS=1 to run service integration tests." :
    (!databaseUrl || !redisUrl ? "DATABASE_URL and REDIS_URL are required." : false),
  timeout: 90_000,
}, async (t) => {
  const prisma = new PrismaClient();
  const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue("webhook-deliveries", { connection: redis });
  const port = Number(process.env.INTEGRATION_API_PORT || 4407);
  const baseUrl = `http://127.0.0.1:${port}`;
  const email = `integration-${randomUUID()}@example.test`;
  const api = spawn(process.execPath, ["server/src/index.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: "test",
      CLIENT_ORIGIN: "http://localhost:5173",
      JWT_SECRET: process.env.JWT_SECRET || "integration-jwt-secret-that-is-long-enough-123",
      SECRET_ENCRYPTION_KEY: process.env.SECRET_ENCRYPTION_KEY || "integration-encryption-secret-1234567890",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  api.stdout.on("data", (chunk) => { output += chunk.toString(); });
  api.stderr.on("data", (chunk) => { output += chunk.toString(); });
  let queuedJobId;
  t.after(async () => {
    api.kill("SIGTERM");
    await Promise.race([once(api, "exit"), new Promise((resolve) => setTimeout(resolve, 5000))]);
    if (queuedJobId) await queue.getJob(queuedJobId).then((job) => job?.remove()).catch(() => {});
    await queue.close();
    await redis.quit();
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  let ready = false;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (api.exitCode !== null) throw new Error(`API exited before becoming ready:\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.equal(ready, true, `API did not become healthy:\n${output}`);

  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "integration-password-123", name: "Integration Test" }),
  });
  assert.equal(registerResponse.status, 201);
  const registration = await registerResponse.json();
  assert.ok(registration.accessToken);
  const token = registration.accessToken;
  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const endpointResponse = await fetch(`${baseUrl}/api/endpoints`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Integration endpoint",
      url: "https://example.com/webhooks",
      eventTypes: ["integration.created"],
    }),
  });
  assert.equal(endpointResponse.status, 201);
  const endpoint = (await endpointResponse.json()).endpoint;

  const eventBody = {
    eventType: "integration.created",
    payload: { testRun: true, sequence: 1 },
  };
  const firstResponse = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { ...authHeaders, "Idempotency-Key": "integration-event-001" },
    body: JSON.stringify(eventBody),
  });
  assert.equal(firstResponse.status, 202);
  const first = await firstResponse.json();
  assert.equal(first.duplicate, false);
  assert.equal(first.deliveryCount, 1);

  const secondResponse = await fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { ...authHeaders, "Idempotency-Key": "integration-event-001" },
    body: JSON.stringify(eventBody),
  });
  assert.equal(secondResponse.status, 200);
  const second = await secondResponse.json();
  assert.equal(second.duplicate, true);
  assert.equal(second.event.id, first.event.id);

  const storedDeliveries = await prisma.delivery.findMany({
    where: { eventId: first.event.id, endpointId: endpoint.id },
  });
  assert.equal(storedDeliveries.length, 1);
  queuedJobId = `delivery-${storedDeliveries[0].id}-attempt-1`;
  const queuedJob = await queue.getJob(queuedJobId);
  assert.ok(queuedJob, "expected the delivery to be enqueued in Redis");

  const historyResponse = await fetch(`${baseUrl}/api/deliveries`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json();
  assert.ok(history.deliveries.some((delivery) => delivery.id === storedDeliveries[0].id));

  const eventHistoryResponse = await fetch(`${baseUrl}/api/events`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(eventHistoryResponse.status, 200);
  const eventHistory = await eventHistoryResponse.json();
  assert.ok(eventHistory.events.some((event) => event.id === first.event.id));
});
