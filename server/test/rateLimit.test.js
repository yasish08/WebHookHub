import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, resetRateLimitStateForTests } from "../src/rateLimit.js";

function mockResponse() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("allows requests within the configured window and reports remaining quota", () => {
  resetRateLimitStateForTests();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, now: () => 10_000, keyGenerator: () => "allow-test" });

  for (const remaining of ["1", "0"]) {
    const res = mockResponse();
    let continued = false;
    limiter({ ip: "127.0.0.1" }, res, () => { continued = true; });
    assert.equal(continued, true);
    assert.equal(res.headers["RateLimit-Remaining"], remaining);
  }
});

test("blocks requests above the limit with 429 and Retry-After", () => {
  resetRateLimitStateForTests();
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: () => 10_000, keyGenerator: () => "block-test" });
  limiter({}, mockResponse(), () => {});

  const res = mockResponse();
  let continued = false;
  limiter({}, res, () => { continued = true; });
  assert.equal(continued, false);
  assert.equal(res.statusCode, 429);
  assert.equal(res.payload.error, "rate_limit_exceeded");
  assert.equal(res.headers["Retry-After"], "60");
});

test("resets the counter after the window expires", () => {
  resetRateLimitStateForTests();
  let timestamp = 10_000;
  const limiter = createRateLimiter({ windowMs: 1_000, max: 1, now: () => timestamp, keyGenerator: () => "window-test" });
  limiter({}, mockResponse(), () => {});

  const blocked = mockResponse();
  limiter({}, blocked, () => {});
  assert.equal(blocked.statusCode, 429);

  timestamp += 1_000;
  const allowed = mockResponse();
  let continued = false;
  limiter({}, allowed, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(allowed.statusCode, 200);
});

test("rejects invalid limiter configuration", () => {
  assert.throws(() => createRateLimiter({ max: 0 }), /max must be a positive integer/);
  assert.throws(() => createRateLimiter({ windowMs: -1 }), /windowMs must be a positive integer/);
});
