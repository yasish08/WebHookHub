import { createHmac } from "node:crypto";

export const MAX_DELIVERY_ATTEMPTS = 5;
export const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;
export const MAX_RESPONSE_BODY_LENGTH = 16 * 1024;

export function shouldRetryStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

export function calculateRetryDelay(attemptNumber, random = Math.random()) {
  const attempt = Math.max(1, Math.floor(Number(attemptNumber) || 1));
  const base = Math.min(MAX_RETRY_DELAY_MS, 1000 * (2 ** (attempt - 1)));
  const sample = Math.min(1, Math.max(0, Number(random) || 0));
  return Math.round(base * (0.8 + sample * 0.4));
}
