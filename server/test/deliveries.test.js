import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createDeliveryRouter } from "../src/deliveries.js";
import { signAccessToken } from "../src/auth.js";

process.env.JWT_SECRET = "delivery-test-secret-".padEnd(40, "x");

async function withServer(prisma, run) {
  const app = express();
  app.use(express.json());
  app.use("/api/deliveries", createDeliveryRouter(prisma));
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}/api/deliveries`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function authHeaders() {
  const token = signAccessToken({ id: "user_1", email: "dev@example.com" });
  return { Authorization: `Bearer ${token}` };
}

test("delivery history requires authentication", async () => {
  await withServer({ delivery: { findMany: async () => { throw new Error("should not query"); } } }, async (url) => {
    const response = await fetch(url);
    assert.equal(response.status, 401);
  });
});

test("delivery history scopes results to the authenticated user and filters valid status", async () => {
  let receivedQuery;
  const prisma = {
    delivery: {
      findMany: async (query) => {
        receivedQuery = query;
        return [{ id: "del_1", status: "FAILED", endpoint: { userId: "user_1" } }];
      },
    },
  };
  await withServer(prisma, async (url) => {
    const response = await fetch(`${url}?status=failed&limit=7`, { headers: authHeaders() });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).deliveries.length, 1);
    assert.deepEqual(receivedQuery.where, { endpoint: { userId: "user_1" }, status: "FAILED" });
    assert.equal(receivedQuery.take, 7);
    assert.equal(receivedQuery.orderBy.createdAt, "desc");
  });
});

test("delivery history defaults invalid limits and caps oversized limits", async () => {
  const limits = [];
  const prisma = { delivery: { findMany: async (query) => { limits.push(query.take); return []; } } };
  await withServer(prisma, async (url) => {
    for (const [query, expected] of [
      ["?limit=0", 30],
      ["?limit=-5", 30],
      ["?limit=10oops", 30],
      ["?limit=2.5", 30],
      ["?limit=1000", 100],
      ["?limit=7", 7],
    ]) {
      const response = await fetch(`${url}${query}`, { headers: authHeaders() });
      assert.equal(response.status, 200, query);
      await response.json();
      assert.equal(limits.at(-1), expected, query);
    }
  });
});

test("attempt inspection does not expose another user's delivery", async () => {
  const prisma = {
    delivery: { findFirst: async (query) => {
      assert.deepEqual(query.where, { id: "secret-delivery", endpoint: { userId: "user_1" } });
      return null;
    } },
    deliveryAttempt: { findMany: async () => { throw new Error("should not query attempts"); } },
  };
  await withServer(prisma, async (url) => {
    const response = await fetch(`${url}/secret-delivery/attempts`, { headers: authHeaders() });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, "delivery_not_found");
  });
});

test("replay rejects deliveries owned by another user", async () => {
  const prisma = {
    delivery: { findFirst: async (query) => {
      assert.deepEqual(query.where, { id: "secret-delivery", endpoint: { userId: "user_1" } });
      return null;
    }, create: async () => { throw new Error("should not create replay"); } },
  };
  await withServer(prisma, async (url) => {
    const response = await fetch(`${url}/secret-delivery/replay`, { method: "POST", headers: authHeaders() });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, "delivery_not_found");
  });
});
