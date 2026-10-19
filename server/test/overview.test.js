import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createOverviewRouter } from "../src/overview.js";
import { signAccessToken } from "../src/auth.js";

process.env.JWT_SECRET = "overview-test-secret-".padEnd(40, "x");

async function withServer(prisma, run) {
  const app = express();
  app.use("/api/overview", createOverviewRouter(prisma));
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}/api/overview`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function fakePrisma() {
  return {
    endpoint: {
      count: async ({ where }) => where.status === "ACTIVE" ? 2 : 3,
      findMany: async () => [],
    },
    event: {
      count: async ({ where }) => where.createdAt ? 5 : 9,
      findMany: async () => [],
    },
    delivery: {
      count: async ({ where }) => {
        if (where.status === "DELIVERED") return 7;
        if (where.status === "RETRYING") return 2;
        if (where.status === "FAILED") return 1;
        if (Array.isArray(where.status?.in)) return 3;
        return 0;
      },
      aggregate: async () => ({ _avg: { durationMs: 137.4 } }),
      findMany: async () => [],
    },
  };
}

test("overview requires a valid bearer token", async () => {
  await withServer(fakePrisma(), async (url) => {
    const response = await fetch(url);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "unauthorized");
  });
});

test("overview returns live, user-scoped metrics and activity buckets", async () => {
  await withServer(fakePrisma(), async (url) => {
    const token = signAccessToken({ id: "user_1", email: "dev@example.com" });
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.metrics.endpointCount, 3);
    assert.equal(data.metrics.activeEndpointCount, 2);
    assert.equal(data.metrics.eventCount, 9);
    assert.equal(data.metrics.eventsLast7Days, 5);
    assert.equal(data.metrics.deliveredCount, 7);
    assert.equal(data.metrics.retryCount, 2);
    assert.equal(data.metrics.failedCount, 1);
    assert.equal(data.metrics.pendingCount, 3);
    assert.equal(data.metrics.successRate, 87.5);
    assert.equal(data.metrics.averageDurationMs, 137);
    assert.equal(data.activityByDay.length, 7);
    assert.ok(data.activityByDay.every((day) => Number.isInteger(day.count)));
  });
});
