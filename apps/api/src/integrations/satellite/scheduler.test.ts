import { getPlatformRuntimeContext } from "../../runtime/context.js";
import { allocateAgentDataDir, releaseAgentDataDir } from "../../test/isolated-data-dir.js";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { preloadDomainPacks } from "../../domain-packs/loader.js";
import { listNdviPlots, resolveNdviPlot } from "./ndvi.js";
import { refreshAllNdviPlots, stopNdviScheduler } from "./scheduler.js";

let testDir: string;

describe("ndvi scheduler", () => {
  beforeAll(async () => {
    await preloadDomainPacks(getPlatformRuntimeContext().loader, { packIds: ["robotics"] });
  });

  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    writeFileSync(
      resolve(testDir, "settings.json"),
      JSON.stringify({
        deployment_id: "dep-gh-pilot-001",
        deployment_name: "test",
        active_domain: "agriculture",
      }),
      "utf8",
    );
  });

  afterEach(() => {
    stopNdviScheduler();
    releaseAgentDataDir(testDir);
  });

  it("listNdviPlots returns empty when satellite_plots unset", () => {
    expect(listNdviPlots()).toEqual([]);
  });

  it("requires explicit plot or entity target", () => {
    writeFileSync(
      resolve(testDir, "settings.json"),
      JSON.stringify({
        deployment_id: "dep-gh-pilot-001",
        deployment_name: "test",
        active_domain: "agriculture",
        satellite_plots: [
          {
            plot_id: "plot-1",
            entity_id: "gh-001",
            west: 121,
            south: 31,
            east: 121.1,
            north: 31.1,
          },
        ],
      }),
      "utf8",
    );

    expect(() => resolveNdviPlot({})).toThrow(/plot_id 或 entity_id/);
    expect(() => resolveNdviPlot({ entity_id: "gh-missing" })).toThrow(/未找到 entity/);
    expect(resolveNdviPlot({ entity_id: "gh-001" }).plot_id).toBe("plot-1");
  });

  it("rejects NDVI refresh when the active Domain Pack has no satellite capability", async () => {
    process.env.ACTIVE_DOMAIN = "robotics";
    writeFileSync(
      resolve(testDir, "settings.json"),
      JSON.stringify({
        deployment_id: "dep-robot-pilot-001",
        deployment_name: "robot",
        active_domain: "robotics",
        satellite_plots: [
          {
            plot_id: "plot-robot",
            entity_id: "m20-001",
            west: 121,
            south: 31,
            east: 121.1,
            north: 31.1,
          },
        ],
      }),
      "utf8",
    );

    await expect(refreshAllNdviPlots()).rejects.toThrow(/satellite 能力/);
  });
});
