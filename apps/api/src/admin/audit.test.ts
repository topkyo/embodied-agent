import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import { saveSettings } from "../settings/store.js";
import { addAdminToken } from "../settings/admin-tokens.js";

let testDir: string;

describe("admin audit hook", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("admin-audit");
    seedCanonicalSimRegistry();
    saveSettings({ deployment_id: "dep-gh-pilot-001", active_domain: "agriculture" });
    process.env.ADMIN_TOKEN = "audit-test-token";
  });

  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
    releaseAgentDataDir(testDir);
  });

  it("logs actor, method, path, and status for admin write operations", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = await buildApp();

    await app.inject({
      method: "PUT",
      url: "/admin/settings",
      headers: { "x-admin-token": "audit-test-token" },
      payload: { deployment_name: "Audit Farm" },
    });

    const auditLine = logSpy.mock.calls
      .map(([line]) => String(line))
      .find((line) => line.includes('"scope":"admin-audit"'));
    expect(auditLine).toBeDefined();
    expect(auditLine).toContain('"actor":"env:ADMIN_TOKEN"');
    expect(auditLine).toContain('"method":"PUT"');
    expect(auditLine).toContain('"path":"/admin/settings"');
    expect(auditLine).toContain('"status":200');
    logSpy.mockRestore();
  });

  it("logs null actor for unauthorized admin write", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = await buildApp();

    await app.inject({
      method: "PUT",
      url: "/admin/settings",
      payload: { deployment_name: "No Auth" },
    });

    const auditLine = logSpy.mock.calls
      .map(([line]) => String(line))
      .find((line) => line.includes('"scope":"admin-audit"'));
    expect(auditLine).toBeDefined();
    expect(auditLine).toContain('"actor":null');
    expect(auditLine).toContain('"status":401');
    logSpy.mockRestore();
  });

  it("logs named token actor when settings token is used", async () => {
    addAdminToken("named", "named-audit-token");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = await buildApp();

    await app.inject({
      method: "POST",
      url: "/admin/settings/tokens",
      headers: { "x-admin-token": "named-audit-token" },
      payload: { name: "another", generate: true },
    });

    const auditLine = logSpy.mock.calls
      .map(([line]) => String(line))
      .find((line) => line.includes('"scope":"admin-audit"'));
    expect(auditLine).toBeDefined();
    expect(auditLine).toContain('"actor":"named"');
    expect(auditLine).toContain('"path":"/admin/settings/tokens"');
    logSpy.mockRestore();
  });
});
