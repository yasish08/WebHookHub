import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);

export function parseEndpointUrl(input, { production = process.env.NODE_ENV === "production" } = {}) {
  if (typeof input !== "string" || input.length > 2048) {
    return { ok: false, message: "Endpoint URL must be a string no longer than 2048 characters." };
  }

  let url;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, message: "Enter a valid absolute endpoint URL." };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return { ok: false, message: "Only HTTP and HTTPS endpoint URLs are supported." };
  }
  if (url.username || url.password) {
    return { ok: false, message: "Endpoint URLs must not contain embedded credentials." };
  }
  if (url.hash) {
    return { ok: false, message: "Endpoint URLs must not contain fragments." };
  }
  if (production && url.protocol !== "https:") {
    return { ok: false, message: "HTTPS is required for endpoint URLs in production." };
  }
  if (url.port && !["80", "443"].includes(url.port)) {
    return { ok: false, message: "Only the standard HTTP and HTTPS ports are allowed." };
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return { ok: false, message: "Local and reserved hostnames cannot be used as endpoints." };
  }

  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) {
      return { ok: false, message: "Private, loopback, link-local, and reserved IP addresses are not allowed." };
    }
  }

  url.hash = "";
  return { ok: true, value: url.toString(), hostname };
}

function isPublicAddress(address) {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}

export async function validateEndpointUrl(input, options = {}) {
  const parsed = parseEndpointUrl(input, options);
  if (!parsed.ok) return parsed;

  const hostname = parsed.hostname;
  if (isIP(hostname)) return parsed;

  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    if (!records.length || records.some((record) => !isPublicAddress(record.address))) {
      return {
        ok: false,
        message: "The endpoint hostname resolves to a private or reserved IP address.",
      };
    }
    return parsed;
  } catch {
    return { ok: false, message: "The endpoint hostname could not be resolved." };
  }
}
