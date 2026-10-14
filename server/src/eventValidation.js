const EVENT_TYPE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

export function validateEventInput(body, idempotencyKey) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, status: 400, error: "invalid_body", message: "Request body must be a JSON object." };
  }

  if (typeof body.eventType !== "string" || !EVENT_TYPE_PATTERN.test(body.eventType)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_event_type",
      message: "eventType must be 1–100 characters and contain only letters, numbers, dots, underscores, colons, or hyphens.",
    };
  }

  if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
    return {
      ok: false,
      status: 400,
      error: "invalid_payload",
      message: "payload must be a JSON object.",
    };
  }

  if (idempotencyKey && idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: "invalid_idempotency_key",
      message: `Idempotency-Key must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
    };
  }

  return { ok: true, value: { eventType: body.eventType, payload: body.payload, idempotencyKey: idempotencyKey || null } };
}

export { MAX_IDEMPOTENCY_KEY_LENGTH };
