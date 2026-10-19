import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateRetryDelay,
  createWebhookSignature,
  MAX_DELIVERY_ATTEMPTS,
  MAX_RETRY_DELAY_MS,
  shouldRetryStatus,
  truncateResponseBody,
  verifyWebhookSignature,
} from "../src/webhookHelpers.js";

test("retry policy retries timeouts, rate limits, and server errors", () => {
  for (const status of [408, 425, 429, 500, 502, 503]) assert.equal(shouldRetryStatus(status), true);
  for (const status of [200, 301, 400, 401, 403, 404]) assert.equal(shouldRetryStatus(status), false);
});

test("retry delay grows exponentially and stays within configured bounds", () => {
  assert.equal(calculateRetryDelay(1, 0), 800);
  assert.equal(calculateRetryDelay(1, 1), 1200);
  assert.equal(calculateRetryDelay(2, 0.5), 2000);
  assert.ok(calculateRetryDelay(100, 1) <= MAX_RETRY_DELAY_MS);
  assert.equal(MAX_DELIVERY_ATTEMPTS, 5);
});

test("signs exact payload bytes and verifies valid signatures", () => {
  const rawBody = JSON.stringify({ id: "evt_123", type: "payment.succeeded", data: { amount: 250 } });
  const secret = "test-secret-value";
  const signed = createWebhookSignature(rawBody, secret, 1_800_000_000);
  assert.match(signed.signature, /^t=1800000000,v1=[a-f0-9]{64}$/);
  assert.equal(verifyWebhookSignature(rawBody, secret, signed.signature, { nowSeconds: 1_800_000_000 }), true);
  assert.equal(verifyWebhookSignature(rawBody + " ", secret, signed.signature, { nowSeconds: 1_800_000_000 }), false);
});

test("rejects expired, malformed, and tampered signature headers", () => {
  const rawBody = '{"ok":true}';
  const secret = "test-secret-value";
  const signed = createWebhookSignature(rawBody, secret, 1_700_000_000);
  assert.equal(verifyWebhookSignature(rawBody, secret, signed.signature, { nowSeconds: 1_800_000_000 }), false);
  assert.equal(verifyWebhookSignature(rawBody, secret, "nonsense", { nowSeconds: 1_700_000_000 }), false);
  assert.equal(verifyWebhookSignature(rawBody, secret, signed.signature.slice(0, -1) + (signed.signature.endsWith("0") ? "1" : "0"), { nowSeconds: 1_700_000_000 }), false);
});

test("truncates captured response bodies to avoid unbounded database writes", () => {
  assert.equal(truncateResponseBody("small"), "small");
  assert.equal(truncateResponseBody("x".repeat(20_000)).length, 16 * 1024);
  assert.equal(truncateResponseBody(undefined), "");
});
