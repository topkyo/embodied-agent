import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { buildApp } from "../app.js";
import { saveSettings } from "../settings/store.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";

let testDir: string;
const ADMIN = "test-admin-token";

describe("POST /admin/nodes/:node_id/pair", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    seedCanonicalSimRegistry();
    process.env.ADMIN_TOKEN = ADMIN;
    process.env.DEPLOYMENT_ID = "dep-gh-pilot-001";
    process.env.ACTIVE_DOMAIN = "agriculture";
    delete process.env.MQTT_URL;
  });
  afterEach(() => {
    delete process.env.ADMIN_TOKEN;
    delete process.env.DEPLOYMENT_ID;
    delete process.env.ACTIVE_DOMAIN;
    delete process.env.MQTT_URL;
    releaseAgentDataDir(testDir);
  });

  it("requires admin token", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/admin/nodes/node-test-001/pair",
      payload: { deployment_id: "dep-gh-pilot-001", entity_id: "gh-001" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("issues install code and returns pair metadata", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/admin/nodes/node-pair-test-001/pair",
      headers: { "x-admin-token": ADMIN },
      payload: { deployment_id: "dep-gh-pilot-001", entity_id: "gh-002", ttl_minutes: 15 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      ok: boolean;
      install_code: string;
      node_id: string;
      entity_id: string;
      mqtt_published: boolean;
      pair_url: string;
    };
    expect(body.ok).toBe(true);
    expect(body.install_code).toMatch(/^DF-[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(body.node_id).toBe("node-pair-test-001");
    expect(body.entity_id).toBe("gh-002");
    expect(body.pair_url).toBe("/scenes/greenhouse/ops/devices/pair?node_id=node-pair-test-001");

    const list = await app.inject({
      method: "GET",
      url: "/admin/node-install-codes",
      headers: { "x-admin-token": ADMIN },
    });
    const codes = list.json() as { codes: { install_code: string }[] };
    expect(codes.codes.some((c) => c.install_code === body.install_code)).toBe(true);
    await app.close();
  });

  it("returns pair URL for the active robotics pack", async () => {
    process.env.ACTIVE_DOMAIN = "robotics";
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      active_domain: "robotics",
      domain_configs: {
        robotics: {
          m20_base_url: "http://127.0.0.1:18080",
          default_robot_id: "m20-001",
        },
      },
    });
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/admin/nodes/node-pair-test-robot/pair",
      headers: { "x-admin-token": ADMIN },
      payload: { deployment_id: "dep-gh-pilot-001", ttl_minutes: 15 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { pair_url: string };
    expect(body.pair_url).toBe("/scenes/robot/ops/devices/pair?node_id=node-pair-test-robot");
    await app.close();
  });
});
