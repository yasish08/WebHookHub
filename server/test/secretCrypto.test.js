import test from "node:test";
import assert from "node:assert/strict";
import { decryptEndpointSecret, encryptEndpointSecret } from "../src/secretCrypto.js";

test("encrypts and decrypts endpoint secrets without storing plaintext", () => {
  process.env.SECRET_ENCRYPTION_KEY = "test-only-encryption-key-that-is-long-enough";
  const secret = "whsec_example_signing_secret";
  const encrypted = encryptEndpointSecret(secret);
  assert.notEqual(encrypted, secret);
  assert.equal(encrypted.startsWith("enc:v1:"), true);
  assert.equal(decryptEndpointSecret(encrypted), secret);
});

test("fails closed when the encryption key changes", () => {
  process.env.SECRET_ENCRYPTION_KEY = "test-only-encryption-key-that-is-long-enough";
  const encrypted = encryptEndpointSecret("whsec_rotation_test");
  process.env.SECRET_ENCRYPTION_KEY = "different-test-encryption-key-that-is-long";
  assert.throws(() => decryptEndpointSecret(encrypted));
});

test("rejects missing or malformed encrypted secrets", () => {
  process.env.SECRET_ENCRYPTION_KEY = "test-only-encryption-key-that-is-long-enough";
  assert.throws(() => decryptEndpointSecret("whsec_plaintext"));
  assert.throws(() => decryptEndpointSecret("enc:v1:broken"));
});
