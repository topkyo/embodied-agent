import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetNodeRuntimeBindingsForTest } from "@embodied-agent/node";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import { initRuntime, resetRuntimeInitForTests } from "./init.js";
import { getPlatformRuntimeContext } from "./context.js";
import { getAgentRuntimeContext } from "./agent-context.js";
import { saveSettings } from "../settings/store.js";

let testDir: string;
let savedNodeEnv: string | undefined;

describe("initRuntime", () => {
  beforeEach(() => {
    savedNodeEnv = process.env.NODE_ENV;
    testDir = allocateAgentDataDir("runtime-init");
    seedCanonicalSimRegistry();
    resetRuntimeInitForTests();
    resetNodeRuntimeBindingsForTest();
  });

  afterEach(() => {
    if (savedNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNodeEnv;
    }
    delete process.env.ADMIN_TOKEN;
    delete process.env.DEPLOYMENT_ID;
    delete process.env.ACTIVE_DOMAIN;
    resetRuntimeInitForTests();
    releaseAgentDataDir(testDir);
  });

  it("binds runtime layers for serverless-style app initialization", async () => {
    await initRuntime();

    const ctx = getAgentRuntimeContext();
    const { buildDeploymentContextSync } = await import("@embodied-agent/agent");
    const deploymentCtx = buildDeploymentContextSync(ctx.bindings);
    expect(deploymentCtx.scene_context_sections.join("\n")).toContain("gh-001");
  });

  it("injects pack-bound services required by the active Domain Pack", async () => {
    await initRuntime();
    const { pickPlatformDomainServices } = await import("@embodied-agent/runtime");
    expect(() =>
      pickPlatformDomainServices(getPlatformRuntimeContext().services, ["satelliteNdvi"]),
    ).not.toThrow();
  });

  it("fails visibly in production when active_domain is missing", async () => {
    process.env.NODE_ENV = "production";
    process.env.ADMIN_TOKEN = "strong-admin-token";
    process.env.METRICS_ALLOW_PUBLIC = "1";
    process.env.DEPLOYMENT_ID = "dep-gh-pilot-001";
    saveSettings({ deployment_id: "dep-gh-pilot-001", active_domain: "agriculture" });
    delete process.env.ACTIVE_DOMAIN;

    const fs = await import("node:fs");
    const path = await import("node:path");
    const settingsPath = path.resolve(testDir, "settings.json");
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
    delete settings.active_domain;
    fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");

    await expect(initRuntime()).rejects.toThrow(/active_domain/);
  });
});
