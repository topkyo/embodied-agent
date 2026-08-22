import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ENC_PREFIX = "eaenc:v1:";

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

export function encryptSecret(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString("base64url");
  return `${ENC_PREFIX}${payload}`;
}

export function decryptSecret(ciphertext: string, secret: string): string {
  if (!isEncryptedSecret(ciphertext)) return ciphertext;
  const raw = ciphertext.slice(ENC_PREFIX.length);
  const buf = Buffer.from(raw, "base64url");
  if (buf.length < 28) {
    throw new Error("encrypted secret payload is too short");
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const key = deriveKey(secret);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function resolveSecretsKey(): string | null {
  const key = process.env.AGENT_SECRETS_KEY?.trim();
  return key || null;
}

export function maybeDecryptSecret(value: string | undefined): string | undefined {
  if (!value?.trim()) return value;
  const key = resolveSecretsKey();
  if (!key || !isEncryptedSecret(value)) return value;
  return decryptSecret(value, key);
}

export function maybeEncryptSecret(value: string | undefined): string | undefined {
  if (!value?.trim()) return value;
  const key = resolveSecretsKey();
  if (!key || isEncryptedSecret(value)) return value;
  return encryptSecret(value, key);
}
