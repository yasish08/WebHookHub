import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createEventReadRouter } from "../src/eventRead.js";
import { signAccessToken } from "../src/auth.js";

process.env.JWT_SECRET = "event-read-test-secret-".padEnd(40, "x");

async function withServer(prisma, run) {
  const app = express();
  app.use("/api/events", createEventReadRouter(prisma));
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}/api/events`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("event history requires authentication", async () => {
  await withServer({ event: { findMany: async () => { throw new Error("should not query"); } } }, async (url) => {
    const response = await fetch(url);
    assert.equal(response.status, 401);
  });
});

test("event history returns delivery outcomes for the authenticated workspace", async () => {
  let receivedQuery;
  const prisma = {
    event: {
      findMany: async (query) => {
        receivedQuery = query;
        return [{
          id: "evt_1",
          eventType: "invoice.paid",
          payload: { invoiceId: "inv_1" },
          status: "COMPLETED",
          idempotencyKey: "test-key",
          createdAt: new Date("2026-10-19T10:00:00.000Z"),
          deliveries: [
            { id: "del_1", status: "DELIVERED", endpoint: { id: "ep_1", name: "billing-hook" } },
            { id: "del_2", status: "FAILED", endpoint: { id: "ep_2", name: "analytics-hook" } },
          ],
        }];
      },
    },
  };
  await withServer(prisma, async (url) => {
    const token = signAccessToken({ id: "user_1", email: "dev@example.com" });
    const response = await fetch(`${url}?limit=50`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.events.length, 1);
    assert.equal(data.events[0].deliveryCount, 2);
    assert.equal(data.events[0].deliveredCount, 1);
    assert.equal(data.events[0].failedCount, 1);
    assert.deepEqual(receivedQuery.where, { userId: "user_1" });
    assert.equal(receivedQuery.take, 50);
  });
});
