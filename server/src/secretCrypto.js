import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function encryptionKey() {
  const configured = process.env.SECRET_ENCRYPTION_KEY;
  if (!configured || configured.length < 32) {
    throw new Error("SECRET_ENCRYPTION_KEY must be configured with at least 32 characters.");
  }
  return createHash("sha256").update(configured, "utf8").digest();
}

export function encryptEndpointSecret(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(":");
}

export function decryptEndpointSecret(stored) {
  if (typeof stored !== "string" || !stored.startsWith(PREFIX)) {
    throw new Error("Endpoint secret is not stored in the supported encrypted format.");
  }
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Encrypted endpoint secret is malformed.");
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
