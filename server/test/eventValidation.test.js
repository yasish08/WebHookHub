import test from "node:test";
import assert from "node:assert/strict";
import { validateEventInput, validateEndpointName, MAX_IDEMPOTENCY_KEY_LENGTH } from "../src/eventValidation.js";

test("accepts a valid event and normalizes an absent idempotency key", () => {
  const result = validateEventInput({ eventType: "payment.succeeded", payload: { amount: 1200 } });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    eventType: "payment.succeeded",
    payload: { amount: 1200 },
    idempotencyKey: null,
  });
});

test("accepts supported event type punctuation", () => {
  assert.equal(validateEventInput({ eventType: "invoice:paid-v2_test", payload: {} }).ok, true);
});

test("rejects a missing or malformed event type", () => {
  for (const eventType of [undefined, "", " has spaces", "x".repeat(101), "event/created"]) {
    assert.equal(validateEventInput({ eventType, payload: {} }).ok, false);
  }
});

test("rejects missing, null, array, and primitive payloads", () => {
  for (const payload of [undefined, null, [], "text", 42, false]) {
    assert.equal(validateEventInput({ eventType: "user.created", payload }).ok, false);
  }
});

test("rejects non-object request bodies", () => {
  for (const body of [null, [], "text", 42]) {
    assert.equal(validateEventInput(body).ok, false);
  }
});

test("accepts an idempotency key at the maximum length and rejects longer keys", () => {
  const body = { eventType: "user.created", payload: {} };
  assert.equal(validateEventInput(body, "k".repeat(MAX_IDEMPOTENCY_KEY_LENGTH)).ok, true);
  assert.equal(validateEventInput(body, "k".repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1)).ok, false);
});

test("trims valid endpoint names", () => {
  assert.deepEqual(validateEndpointName("  payments-prod  "), { ok: true, value: "payments-prod" });
});

test("rejects endpoint names outside the supported length", () => {
  assert.equal(validateEndpointName("").ok, false);
  assert.equal(validateEndpointName("x".repeat(81)).ok, false);
  assert.equal(validateEndpointName(null).ok, false);
});
