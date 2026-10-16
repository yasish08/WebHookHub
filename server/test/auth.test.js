import test from "node:test";
import assert from "node:assert/strict";
import { requireAuth, signAccessToken } from "../src/auth.js";

function mockResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("creates a signed access token and authenticates its owner", () => {
  process.env.JWT_SECRET = "test-jwt-secret-long-enough-for-unit-tests";
  const user = { id: "user_test_123", email: "dev@example.com" };
  const token = signAccessToken(user);
  const req = { get: (name) => name === "Authorization" ? `Bearer ${token}` : undefined };
  const res = mockResponse();
  let continued = false;

  requireAuth(req, res, () => { continued = true; });

  assert.equal(continued, true);
  assert.deepEqual(req.auth, { userId: user.id, email: user.email });
});

test("rejects missing and invalid bearer tokens", () => {
  process.env.JWT_SECRET = "test-jwt-secret-long-enough-for-unit-tests";
  for (const authorization of [undefined, "Basic abc", "Bearer definitely-not-a-jwt"]) {
    const req = { get: (name) => name === "Authorization" ? authorization : undefined };
    const res = mockResponse();
    let continued = false;
    requireAuth(req, res, () => { continued = true; });
    assert.equal(continued, false);
    assert.equal(res.statusCode, 401);
  }
});

test("fails closed when JWT_SECRET is missing or too short", () => {
  process.env.JWT_SECRET = "short";
  const req = { get: () => "Bearer token" };
  const res = mockResponse();
  requireAuth(req, res, () => assert.fail("must not authenticate without a strong secret"));
  assert.equal(res.statusCode, 503);
});
