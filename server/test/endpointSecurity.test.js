import test from "node:test";
import assert from "node:assert/strict";
import { parseEndpointUrl } from "../src/endpointSecurity.js";

test("accepts a public HTTPS endpoint URL", () => {
  const result = parseEndpointUrl("https://hooks.example.com/v1/events", { production: true });
  assert.equal(result.ok, true);
  assert.equal(result.value, "https://hooks.example.com/v1/events");
});

test("rejects unsupported protocols and embedded credentials", () => {
  assert.equal(parseEndpointUrl("file:///etc/passwd", { production: false }).ok, false);
  assert.equal(parseEndpointUrl("ftp://example.com/hook", { production: false }).ok, false);
  assert.equal(parseEndpointUrl("https://user:pass@example.com/hook", { production: true }).ok, false);
});

test("rejects localhost and private or reserved IP destinations", () => {
  for (const url of [
    "http://localhost/hook",
    "http://service.local/hook",
    "http://127.0.0.1/hook",
    "http://10.0.0.8/hook",
    "http://192.168.1.20/hook",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/hook",
    "http://172.20.0.5/hook",
  ]) {
    assert.equal(parseEndpointUrl(url, { production: false }).ok, false, url);
  }
});

test("requires HTTPS in production and restricts ports", () => {
  assert.equal(parseEndpointUrl("http://hooks.example.com", { production: true }).ok, false);
  assert.equal(parseEndpointUrl("https://hooks.example.com:8443/hook", { production: false }).ok, false);
});

test("rejects malformed or oversized URLs", () => {
  assert.equal(parseEndpointUrl("not-a-url").ok, false);
  assert.equal(parseEndpointUrl("https://example.com/" + "a".repeat(2050)).ok, false);
});
