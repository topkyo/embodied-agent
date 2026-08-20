import { afterEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  maybeDecryptSecret,
  maybeEncryptSecret,
} from "./secrets-crypto.js";

describe("secrets-crypto", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("round-trips plaintext with AES-256-GCM", () => {
    const key = "test-secrets-key";
    const encrypted = encryptSecret("sk-live-abc", key);
    expect(isEncryptedSecret(encrypted)).toBe(true);
    expect(decryptSecret(encrypted, key)).toBe("sk-live-abc");
  });

  it("maybeEncryptSecret skips when AGENT_SECRETS_KEY is unset", () => {
    delete process.env.AGENT_SECRETS_KEY;
    expect(maybeEncryptSecret("plain")).toBe("plain");
  });

  it("maybeEncryptSecret writes eaenc:v1 prefix when key is set", () => {
    process.env.AGENT_SECRETS_KEY = "runtime-key";
    const encrypted = maybeEncryptSecret("plain");
    expect(encrypted).toBeDefined();
    expect(isEncryptedSecret(encrypted!)).toBe(true);
  });

  it("maybeDecryptSecret returns ciphertext when key is unset", () => {
    delete process.env.AGENT_SECRETS_KEY;
    const encrypted = encryptSecret("secret", "offline-key");
    expect(maybeDecryptSecret(encrypted)).toBe(encrypted);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptSecret("secret", "key-a");
    const tampered = `${encrypted.slice(0, -2)}xx`;
    expect(() => decryptSecret(tampered, "key-a")).toThrow();
  });
});
