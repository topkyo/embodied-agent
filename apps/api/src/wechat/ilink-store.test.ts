import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isEncryptedSecret } from "@embodied-agent/platform";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { saveWechatAccount, loadWechatAccount } from "./ilink-store.js";
import { dataRoot } from "../fs/deployment-path.js";

let testDir: string;

describe("wechat ilink store", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("ilink-store");
    process.env.AGENT_SECRETS_KEY = "test-wechat-secrets-key";
  });

  afterEach(() => {
    delete process.env.AGENT_SECRETS_KEY;
    releaseAgentDataDir(testDir);
  });

  it("encrypts token at rest when AGENT_SECRETS_KEY is set", () => {
    saveWechatAccount({
      account_id: "bot@test",
      token: "plain-token",
      base_url: "https://example.test",
      saved_at: "2026-07-07T00:00:00.000Z",
    });
    const onDisk = JSON.parse(
      readFileSync(resolve(dataRoot(), "wechat-ilink", "bot_test.json"), "utf8"),
    ) as { token: string };
    expect(isEncryptedSecret(onDisk.token)).toBe(true);
    expect(loadWechatAccount("bot@test")?.token).toBe("plain-token");
  });

  it("migrates legacy plaintext token on load", () => {
    saveWechatAccount({
      account_id: "legacy@test",
      token: "legacy-plain",
      base_url: "https://example.test",
      saved_at: "2026-07-07T00:00:00.000Z",
    });
    const path = resolve(dataRoot(), "wechat-ilink", "legacy_test.json");
    const raw = JSON.parse(readFileSync(path, "utf8")) as { token: string };
    raw.token = "legacy-plain";
    writeFileSync(path, JSON.stringify(raw));
    expect(loadWechatAccount("legacy@test")?.token).toBe("legacy-plain");
    const migrated = JSON.parse(readFileSync(path, "utf8")) as { token: string };
    expect(isEncryptedSecret(migrated.token)).toBe(true);
  });
});
