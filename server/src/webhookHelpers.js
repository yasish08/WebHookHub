import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_DELIVERY_ATTEMPTS = 5;
export const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;
export const MAX_RESPONSE_BODY_LENGTH = 16 * 1024;
export const DELIVERY_TIMEOUT_MS = 10_000;

export function shouldRetryStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function calculateRetryDelay(attemptNumber, random = Math.random()) {
  const attempt = Math.max(1, Math.floor(Number(attemptNumber) || 1));
  const base = Math.min(MAX_RETRY_DELAY_MS, 1000 * (2 ** (attempt - 1)));
  const sample = Math.min(1, Math.max(0, Number(random) || 0));
  return Math.min(MAX_RETRY_DELAY_MS, Math.round(base * (0.8 + sample * 0.4)));
}

export function createWebhookSignature(rawBody, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signedPayload = `${timestamp}.${rawBody}`;
  const digest = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  return { timestamp, signature: `t=${timestamp},v1=${digest}` };
}

export function verifyWebhookSignature(rawBody, secret, header, { toleranceSeconds = 300, nowSeconds = Math.floor(Date.now() / 1000) } = {}) {
  if (typeof header !== "string" || typeof rawBody !== "string" || typeof secret !== "string") return false;
  const parts = Object.fromEntries(header.split(",").map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? ["", ""] : [part.slice(0, index), part.slice(index + 1)];
  }));
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > toleranceSeconds || !/^[a-f0-9]{64}$/i.test(parts.v1 || "")) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  const received = Buffer.from(parts.v1, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function truncateResponseBody(value) {
  if (typeof value !== "string") return "";
  return value.length > MAX_RESPONSE_BODY_LENGTH ? value.slice(0, MAX_RESPONSE_BODY_LENGTH) : value;
}
