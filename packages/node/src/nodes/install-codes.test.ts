import { allocateAgentDataDir, releaseAgentDataDir } from "@embodied-agent/platform";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceRegistry } from "@embodied-agent/core";
import { saveRegistry } from "../registry/store.js";
import { claimNodeInstallCode, issueNodeInstallCode } from "./install-codes.js";

const CANONICAL_SIM_REGISTRY: DeviceRegistry = {
  deployments: [
    {
      deployment_id: "dep-001",
      name: "Test Deployment",
      timezone: "Asia/Shanghai",
      status: "active",
    },
  ],
  entities: [
    {
      deployment_id: "dep-001",
      domain_id: "test-domain",
      entity_type: "test-entity",
      entity_id: "entity-001",
      name: "Test Entity",
      aliases: ["entity"],
      status: "active",
    },
  ],
  nodes: [],
  devices: [],
};

const CODE_FORMAT = /^DF-[0-9A-HJKMNP-TV-Z]{8}$/;

let testDir: string;

describe("issueNodeInstallCode / claimNodeInstallCode", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("install-codes");
    saveRegistry(CANONICAL_SIM_REGISTRY);
  });

  afterEach(() => {
    vi.useRealTimers();
    releaseAgentDataDir(testDir);
  });

  it("generates install codes matching Crockford DF- format", () => {
    const entry = issueNodeInstallCode({ deployment_id: "dep-001" });
    expect(entry.install_code).toMatch(CODE_FORMAT);
  });

  it("generates 1000 unique codes without duplicates", { timeout: 60_000 }, () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      const entry = issueNodeInstallCode({ deployment_id: "dep-001" });
      expect(entry.install_code).toMatch(CODE_FORMAT);
      expect(seen.has(entry.install_code)).toBe(false);
      seen.add(entry.install_code);
      claimNodeInstallCode("dep-001", entry.install_code, `node-gen-${i}`);
    }
    expect(seen.size).toBe(1000);
  });

  it("rejects claim when node_id does not match bound code", () => {
    const entry = issueNodeInstallCode({
      deployment_id: "dep-001",
      node_id: "node-bound-a",
    });
    expect(() =>
      claimNodeInstallCode("dep-001", entry.install_code, "node-bound-b"),
    ).toThrow("invalid_or_expired_install_code");
    const scene = claimNodeInstallCode("dep-001", entry.install_code, "node-bound-a");
    expect(scene.deployment_id).toBe("dep-001");
  });

  it("throws when ttl_minutes is out of range", () => {
    expect(() => issueNodeInstallCode({ deployment_id: "dep-001", ttl_minutes: 0 })).toThrow(
      "ttl_minutes 必须在 1..1440",
    );
    expect(() => issueNodeInstallCode({ deployment_id: "dep-001", ttl_minutes: 10000 })).toThrow(
      "ttl_minutes 必须在 1..1440",
    );
  });

  it("throws too_many_active_install_codes on the 21st unused code", () => {
    for (let i = 0; i < 20; i += 1) {
      issueNodeInstallCode({ deployment_id: "dep-001" });
    }
    expect(() => issueNodeInstallCode({ deployment_id: "dep-001" })).toThrow(
      "too_many_active_install_codes",
    );
  });

  it("rejects expired install codes", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-01T00:00:00.000Z");
    vi.setSystemTime(now);

    const entry = issueNodeInstallCode({ deployment_id: "dep-001", ttl_minutes: 1 });
    vi.setSystemTime(new Date(now.getTime() + 61_000));

    expect(() => claimNodeInstallCode("dep-001", entry.install_code, "node-expired")).toThrow(
      "invalid_or_expired_install_code",
    );
  });
});
