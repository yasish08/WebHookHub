import { createHmac } from "node:crypto";

export const MAX_DELIVERY_ATTEMPTS = 5;
export const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;
export const MAX_RESPONSE_BODY_LENGTH = 16 * 1024;
