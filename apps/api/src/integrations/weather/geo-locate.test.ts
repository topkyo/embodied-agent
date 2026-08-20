import { allocateAgentDataDir, releaseAgentDataDir } from "../../test/isolated-data-dir.js";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  clearGeoCacheForTests,
  fetchIpCoordinates,
  refreshNetworkCoordinates,
  resolveDeploymentCoordinatesSync,
} from "./geo-locate.js";

let testDir: string;

describe("geo-locate", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    delete process.env.GEO_LATITUDE;
    delete process.env.GEO_LONGITUDE;
  });
  afterEach(() => {
    clearGeoCacheForTests();
    vi.restoreAllMocks();
    releaseAgentDataDir(testDir);
  });

  it("throws without configured coordinates or cache", () => {
    expect(() => resolveDeploymentCoordinatesSync()).toThrow(/coordinates/);
  });

  it("fetches and caches IP coordinates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          latitude: 30.5,
          longitude: 114.3,
          city: "Wuhan",
        }),
      })),
    );
    const coords = await refreshNetworkCoordinates({ force: true });
    expect(coords.latitude).toBe(30.5);
    expect(coords.source).toBe("ip");
    const again = resolveDeploymentCoordinatesSync();
    expect(again.latitude).toBe(30.5);
    expect(again.source).toBe("ip");
  });

  it("fetchIpCoordinates throws on invalid payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ success: false }),
      })),
    );
    await expect(fetchIpCoordinates()).rejects.toThrow(/有效坐标/);
  });
});
