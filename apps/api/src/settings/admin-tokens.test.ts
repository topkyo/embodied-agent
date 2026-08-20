import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { saveSettings } from "./store.js";
import {
  addAdminToken,
  matchAdminToken,
  removeAdminToken,
  resetLegacyAdminTokenWarnForTests,
  warnLegacyAdminTokenOnStartup,
} from "./admin-tokens.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";

let testDir: string;

describe("admin tokens", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("admin-tokens");
    seedCanonicalSimRegistry();
    saveSettings({ deployment_id: "dep-gh-pilot-001", active_domain: "agriculture" });
    delete process.env.ADMIN_TOKEN;
    resetLegacyAdminTokenWarnForTests();
  });

  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
    resetLegacyAdminTokenWarnForTests();
    releaseAgentDataDir(testDir);
  });

  it("matches named tokens from settings", () => {
    addAdminToken("ops", "ops-secret-token");
    addAdminToken("backup", "backup-secret-token");

    expect(matchAdminToken("ops-secret-token")).toEqual({
      matched: true,
      actor: "ops",
    });
    expect(matchAdminToken("backup-secret-token")).toEqual({
      matched: true,
      actor: "backup",
    });
    expect(matchAdminToken("wrong-token")).toEqual({ matched: false });
  });

  it("rejects disabled tokens", () => {
    addAdminToken("disabled-one", "disabled-token-value");
    const settingsPath = resolve(testDir, "settings.json");
    const raw = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    const tokens = raw.admin_tokens as Array<Record<string, unknown>>;
    tokens[0]!.disabled = true;
    writeFileSync(settingsPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

    expect(matchAdminToken("disabled-token-value")).toEqual({ matched: false });
  });

  it("matches legacy admin_token with legacy actor name", () => {
    const settingsPath = resolve(testDir, "settings.json");
    const raw = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    raw.admin_token = "legacy-single-token";
    writeFileSync(settingsPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

    expect(matchAdminToken("legacy-single-token")).toEqual({
      matched: true,
      actor: "legacy:admin_token",
    });
  });

  it("warns once when legacy admin_token is present without admin_tokens", () => {
    const settingsPath = resolve(testDir, "settings.json");
    const raw = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    raw.admin_token = "legacy-single-token";
    writeFileSync(settingsPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    warnLegacyAdminTokenOnStartup();
    warnLegacyAdminTokenOnStartup();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const line = warnSpy.mock.calls[0]?.[0];
    expect(String(line)).toContain("admin_token");
    warnSpy.mockRestore();
  });

  it("prevents deleting the token used by the current request", () => {
    addAdminToken("current", "current-token-value");
    expect(() => removeAdminToken("current", "current")).toThrow(/不能删除当前请求/);
  });

  it("preserves admin tokens when saving unrelated settings", () => {
    addAdminToken("persist", "persist-token-value");
    saveSettings({ deployment_name: "Renamed Site" });
    expect(matchAdminToken("persist-token-value")).toEqual({
      matched: true,
      actor: "persist",
    });
  });
});
