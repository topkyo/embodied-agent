import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { atomicWriteJson } from "@embodied-agent/platform";
import { dataRoot } from "../fs/deployment-path.js";
import { configureDomainPackLoader, preloadDomainPacks } from "../domain-packs/loader.js";
import { getSceneMode, resetSceneModesForTests, setSceneMode } from "@embodied-agent/runtime";
import { getPlatformRuntimeContext } from "../runtime/context.js";

function modeStorePath(dataDir: string): string {
  return join(dataDir, "domain-packs", "agriculture", "greenhouse-modes.json");
}

describe("mode-store", () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "df-mode-store-"));
    process.env.AGENT_DATA_DIR = dataDir;
    const ctx = getPlatformRuntimeContext();
    configureDomainPackLoader(
      ctx.loader,
      {
        storage: { dataRoot, atomicWriteJson },
      },
      ctx.services,
    );
    await preloadDomainPacks(ctx.loader, { packIds: ["agriculture"] });
    resetSceneModesForTests(ctx);
  });

  afterEach(() => {
    resetSceneModesForTests(getPlatformRuntimeContext());
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.AGENT_DATA_DIR;
  });

  it("writes night_vent mode to the agriculture domain data directory", () => {
    const ctx = getPlatformRuntimeContext();
    setSceneMode(ctx, "gh-001", "owner-001", {
      mode: "night_vent",
      max_temp_c: 30,
    });
    expect(getSceneMode(ctx, "gh-001")?.mode).toBe("night_vent");
    const raw = JSON.parse(readFileSync(modeStorePath(dataDir), "utf8")) as Array<{
      greenhouse_id: string;
      max_temp_c: number;
    }>;
    expect(raw).toHaveLength(1);
    expect(raw[0]?.greenhouse_id).toBe("gh-001");
    expect(raw[0]?.max_temp_c).toBe(30);
  });

  it("removes mode from disk when set to off", () => {
    const ctx = getPlatformRuntimeContext();
    setSceneMode(ctx, "gh-001", "owner-001", {
      mode: "night_vent",
      max_temp_c: 30,
    });
    setSceneMode(ctx, "gh-001", "owner-001", { mode: "off" });
    expect(getSceneMode(ctx, "gh-001")).toBeUndefined();
    const raw = JSON.parse(readFileSync(modeStorePath(dataDir), "utf8")) as unknown[];
    expect(raw).toHaveLength(0);
  });

  it("fails visibly when persisted mode data is corrupt", async () => {
    const path = modeStorePath(dataDir);
    mkdirSync(join(dataDir, "domain-packs", "agriculture"), { recursive: true });
    writeFileSync(path, "{bad json");
    const ctx = getPlatformRuntimeContext();
    configureDomainPackLoader(
      ctx.loader,
      {
        storage: { dataRoot, atomicWriteJson },
      },
      ctx.services,
    );
    await preloadDomainPacks(ctx.loader, { packIds: ["agriculture"] });
    expect(() => resetSceneModesForTests(ctx)).toThrow(/greenhouse-modes\.json/);
    if (existsSync(path)) rmSync(path, { force: true });
  });
});
