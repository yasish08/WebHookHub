import { randomBytes } from "node:crypto";
import { Router } from "express";
import { requireAuth } from "./auth.js";
import { validateEndpointUrl } from "./endpointSecurity.js";
import { encryptEndpointSecret } from "./secretCrypto.js";
import { validateEndpointName } from "./eventValidation.js";

const EVENT_TYPE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/;
const PUBLIC_ENDPOINT_FIELDS = {
  id: true,
  name: true,
  url: true,
  status: true,
  eventTypes: true,
  createdAt: true,
  updatedAt: true,
};

function validateEventTypes(value) {
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value) || value.length > 100) {
    return { ok: false, message: "eventTypes must be an array of at most 100 event type strings." };
  }
  if (value.some((item) => typeof item !== "string" || !EVENT_TYPE_PATTERN.test(item))) {
    return { ok: false, message: "Each event type must be 1–100 characters using letters, numbers, dots, underscores, colons, or hyphens." };
  }
  return { ok: true, value: [...new Set(value)] };
}

function newSecret() {
  return "whsec_" + randomBytes(32).toString("base64url");
}

export function createEndpointRouter(prisma) {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    try {
      const endpoints = await prisma.endpoint.findMany({
        where: { userId: req.auth.userId },
        select: { ...PUBLIC_ENDPOINT_FIELDS, _count: { select: { deliveries: true } } },
        orderBy: { createdAt: "desc" },
      });
      return res.json({ endpoints });
    } catch (error) {
      console.error("[endpoints:list_error]", error);
      return res.status(500).json({ error: "endpoint_list_failed", message: "Endpoints could not be loaded." });
    }
  });

  router.post("/", async (req, res) => {
    const nameResult = validateEndpointName(req.body?.name);
    if (!nameResult.ok) return res.status(400).json({ error: "invalid_name", message: nameResult.error });

    const eventTypesResult = validateEventTypes(req.body?.eventTypes ?? []);
    if (!eventTypesResult.ok) return res.status(400).json({ error: "invalid_event_types", message: eventTypesResult.message });

    const urlResult = await validateEndpointUrl(req.body?.url);
    if (!urlResult.ok) return res.status(400).json({ error: "invalid_endpoint_url", message: urlResult.message });

    if (!process.env.SECRET_ENCRYPTION_KEY || process.env.SECRET_ENCRYPTION_KEY.length < 32) {
      return res.status(503).json({ error: "secret_encryption_not_configured", message: "Set SECRET_ENCRYPTION_KEY to at least 32 characters before creating endpoints." });
    }

    const secret = newSecret();
    try {
      const endpoint = await prisma.endpoint.create({
        data: {
          name: nameResult.value,
          url: urlResult.value,
          secret: encryptEndpointSecret(secret),
          eventTypes: eventTypesResult.value,
          userId: req.auth.userId,
        },
        select: PUBLIC_ENDPOINT_FIELDS,
      });
      return res.status(201).json({
        endpoint,
        signingSecret: secret,
        secretNotice: "Copy this signing secret now. It will not be shown again.",
      });
    } catch (error) {
      console.error("[endpoints:create_error]", error);
      return res.status(500).json({ error: "endpoint_create_failed", message: "The endpoint could not be created." });
    }
  });

  router.patch("/:id", async (req, res) => {
    const { id } = req.params;
    const data = {};

    if (Object.hasOwn(req.body ?? {}, "name")) {
      const result = validateEndpointName(req.body.name);
      if (!result.ok) return res.status(400).json({ error: "invalid_name", message: result.error });
      data.name = result.value;
    }
    if (Object.hasOwn(req.body ?? {}, "url")) {
      const result = await validateEndpointUrl(req.body.url);
      if (!result.ok) return res.status(400).json({ error: "invalid_endpoint_url", message: result.message });
      data.url = result.value;
    }
    if (Object.hasOwn(req.body ?? {}, "eventTypes")) {
      const result = validateEventTypes(req.body.eventTypes);
      if (!result.ok) return res.status(400).json({ error: "invalid_event_types", message: result.message });
      data.eventTypes = result.value;
    }
    if (Object.hasOwn(req.body ?? {}, "status")) {
      if (!["ACTIVE", "PAUSED", "DISABLED"].includes(req.body.status)) {
        return res.status(400).json({ error: "invalid_status", message: "status must be ACTIVE, PAUSED, or DISABLED." });
      }
      data.status = req.body.status;
    }

    if (!Object.keys(data).length) {
      return res.status(400).json({ error: "empty_update", message: "Provide at least one supported endpoint field to update." });
    }

    try {
      const existing = await prisma.endpoint.findFirst({ where: { id, userId: req.auth.userId }, select: { id: true } });
      if (!existing) return res.status(404).json({ error: "endpoint_not_found", message: "Endpoint not found." });
      const endpoint = await prisma.endpoint.update({ where: { id }, data, select: PUBLIC_ENDPOINT_FIELDS });
      return res.json({ endpoint });
    } catch (error) {
      console.error("[endpoints:update_error]", error);
      return res.status(500).json({ error: "endpoint_update_failed", message: "The endpoint could not be updated." });
    }
  });

  router.post("/:id/rotate-secret", async (req, res) => {
    if (!process.env.SECRET_ENCRYPTION_KEY || process.env.SECRET_ENCRYPTION_KEY.length < 32) {
      return res.status(503).json({ error: "secret_encryption_not_configured", message: "Set SECRET_ENCRYPTION_KEY to at least 32 characters before rotating secrets." });
    }
    const { id } = req.params;
    try {
      const existing = await prisma.endpoint.findFirst({ where: { id, userId: req.auth.userId }, select: { id: true } });
      if (!existing) return res.status(404).json({ error: "endpoint_not_found", message: "Endpoint not found." });
      const signingSecret = newSecret();
      const endpoint = await prisma.endpoint.update({
        where: { id },
        data: { secret: encryptEndpointSecret(signingSecret) },
        select: PUBLIC_ENDPOINT_FIELDS,
      });
      return res.json({ endpoint, signingSecret, secretNotice: "Copy this signing secret now. It will not be shown again." });
    } catch (error) {
      console.error("[endpoints:rotate_secret_error]", error);
      return res.status(500).json({ error: "secret_rotation_failed", message: "The signing secret could not be rotated." });
    }
  });

  router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const existing = await prisma.endpoint.findFirst({ where: { id, userId: req.auth.userId }, select: { id: true } });
      if (!existing) return res.status(404).json({ error: "endpoint_not_found", message: "Endpoint not found." });
      await prisma.endpoint.delete({ where: { id } });
      return res.status(204).end();
    } catch (error) {
      console.error("[endpoints:delete_error]", error);
      return res.status(500).json({ error: "endpoint_delete_failed", message: "The endpoint could not be deleted." });
    }
  });

  return router;
}
