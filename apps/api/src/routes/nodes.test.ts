import { afterEach, beforeEach, describe, expect, it } from "vitest";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { registerNodeRoutes } from "./nodes.js";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import {
  activateNode,
  getNode,
  issueNodeInstallCode,
  loadRegistry,
  upsertNodeInRegistry,
} from "@embodied-agent/node";
import { resolveAgentDataDir as dataRoot } from "@embodied-agent/platform";
import { rmSync } from "node:fs";
import { join } from "node:path";

const DEPLOYMENT_ID = "dep-gh-pilot-001";
const ENTITY_ID = "gh-001";

describe("POST /nodes/register", () => {
  let testDir: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    testDir = allocateAgentDataDir("nodes-route");
    seedCanonicalSimRegistry();
    app = Fastify();
    await registerNodeRoutes(app);
  });

  afterEach(async () => {
    await app.close();
    releaseAgentDataDir(testDir);
  });

  it("fails with 400 when install_code is missing (schema validation)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        node_id: "node-test-001",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("fails with 400 when deployment_id is missing (schema validation)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        install_code: "DF-000000",
        node_id: "node-test-001",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("fails with 400 when node_id is missing (schema validation)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: "DF-000000",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("fails with 400 when all fields are empty strings", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: "",
        install_code: "",
        node_id: "",
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("missing_deployment_id_install_code_or_node_id");
  });

  it("fails with 400 for invalid install code", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: "DF-INVALID-CODE",
        node_id: "node-test-001",
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("invalid");
  });

  it("fails with 400 when install code has already been consumed (re-registration)", async () => {
    const entry = issueNodeInstallCode({ deployment_id: DEPLOYMENT_ID, entity_id: ENTITY_ID });
    const nodeId = "node-test-duplicate";

    // First registration succeeds — consumes the install code
    const first = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: entry.install_code,
        node_id: nodeId,
      },
    });
    expect(first.statusCode).toBe(200);

    // Second attempt with the same (now consumed) code fails
    const second = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: entry.install_code,
        node_id: nodeId,
      },
    });
    expect(second.statusCode).toBe(400);
    const body = JSON.parse(second.body);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("invalid");
  });

  it("registers successfully with a valid install code and returns node_token", async () => {
    const entry = issueNodeInstallCode({ deployment_id: DEPLOYMENT_ID, entity_id: ENTITY_ID });
    const nodeId = "node-test-success";

    const res = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: entry.install_code,
        node_id: nodeId,
        firmware_version: "1.2.3",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("pending");
    expect(body.node_id).toBe(nodeId);
    expect(body.deployment_id).toBe(DEPLOYMENT_ID);
    expect(body.entity_id).toBe(ENTITY_ID);
    expect(typeof body.node_token).toBe("string");
    expect(body.node_token.startsWith("node_")).toBe(true);

    // Node should be persisted in registry as pending
    const registry = loadRegistry();
    const node = (registry.nodes ?? []).find(
      (n) => n.node_id === nodeId && n.deployment_id === DEPLOYMENT_ID,
    );
    expect(node).toBeDefined();
    expect(node!.status).toBe("pending");
    expect(node!.firmware_version).toBe("1.2.3");
  });

  it("defaults firmware_version to 0.1.0 when not provided", async () => {
    const entry = issueNodeInstallCode({ deployment_id: DEPLOYMENT_ID, entity_id: ENTITY_ID });
    const nodeId = "node-test-fw-default";

    const res = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: entry.install_code,
        node_id: nodeId,
      },
    });

    expect(res.statusCode).toBe(200);
    const registry = loadRegistry();
    const node = (registry.nodes ?? []).find((n) => n.node_id === nodeId);
    expect(node!.firmware_version).toBe("0.1.0");
  });

  it("fails visibly (500) when device-registry.json is missing — no implicit fallback", async () => {
    // Seed registry so issueNodeInstallCode can verify deployment exists,
    // then issue a code and remove the registry file to simulate missing registry.
    const entry = issueNodeInstallCode({ deployment_id: DEPLOYMENT_ID, entity_id: ENTITY_ID });

    const registryPath = join(dataRoot(), "device-registry.json");
    rmSync(registryPath, { force: true });

    const res = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: entry.install_code,
        node_id: "node-test-no-registry",
      },
    });

    // claimNodeInstallCode succeeds (doesn't need registry),
    // but upsertNodeInRegistry → loadRegistry throws → 500
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("registry_update_failed");
  });

  it("upserts (updates) an existing pending node when re-registering with a fresh install code", async () => {
    const nodeId = "node-test-upsert";

    const entry1 = issueNodeInstallCode({ deployment_id: DEPLOYMENT_ID, entity_id: ENTITY_ID });
    const first = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: entry1.install_code,
        node_id: nodeId,
        firmware_version: "1.0.0",
      },
    });
    expect(first.statusCode).toBe(200);

    const entry2 = issueNodeInstallCode({ deployment_id: DEPLOYMENT_ID, entity_id: ENTITY_ID });
    const second = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: entry2.install_code,
        node_id: nodeId,
        firmware_version: "2.0.0",
      },
    });
    expect(second.statusCode).toBe(200);

    const registry = loadRegistry();
    const nodes = (registry.nodes ?? []).filter(
      (n) => n.node_id === nodeId && n.deployment_id === DEPLOYMENT_ID,
    );
    expect(nodes.length).toBe(1);
    expect(nodes[0]!.firmware_version).toBe("2.0.0");
    expect(nodes[0]!.status).toBe("pending");
    expect(nodes[0]!.entity_id).toBe(ENTITY_ID);
  });

  it("returns 409 without token for active node and does not consume install code", async () => {
    const nodeId = "node-active-no-token";
    const entry1 = issueNodeInstallCode({ deployment_id: DEPLOYMENT_ID, entity_id: ENTITY_ID });
    const first = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: entry1.install_code,
        node_id: nodeId,
      },
    });
    expect(first.statusCode).toBe(200);
    const nodeToken = JSON.parse(first.body).node_token as string;

    const pending = getNode(DEPLOYMENT_ID, nodeId)!;
    upsertNodeInRegistry({ ...pending, name: "KeepMe" });
    activateNode(DEPLOYMENT_ID, nodeId);

    const entry2 = issueNodeInstallCode({ deployment_id: DEPLOYMENT_ID, entity_id: ENTITY_ID });
    const denied = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: entry2.install_code,
        node_id: nodeId,
        firmware_version: "2.0.0",
      },
    });
    expect(denied.statusCode).toBe(409);
    expect(JSON.parse(denied.body).error).toBe("node_already_active");

    const ok = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: entry2.install_code,
        node_id: nodeId,
        firmware_version: "2.0.0",
        node_token: nodeToken,
      },
    });
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).status).toBe("active");
  });

  it("returns 409 with wrong token for active node and does not consume install code", async () => {
    const nodeId = "node-active-wrong-token";
    const entry1 = issueNodeInstallCode({ deployment_id: DEPLOYMENT_ID, entity_id: ENTITY_ID });
    const first = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: entry1.install_code,
        node_id: nodeId,
      },
    });
    expect(first.statusCode).toBe(200);
    const nodeToken = JSON.parse(first.body).node_token as string;

    activateNode(DEPLOYMENT_ID, nodeId);

    const entry2 = issueNodeInstallCode({ deployment_id: DEPLOYMENT_ID, entity_id: ENTITY_ID });
    const denied = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: entry2.install_code,
        node_id: nodeId,
        node_token: "node_wrongtokenxxxxxxxxxxxxxxxx",
      },
    });
    expect(denied.statusCode).toBe(409);
    expect(JSON.parse(denied.body).error).toBe("node_already_active");

    const ok = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: entry2.install_code,
        node_id: nodeId,
        node_token: nodeToken,
      },
    });
    expect(ok.statusCode).toBe(200);
  });

  it("re-registers active node with valid token and preserves name and status", async () => {
    const nodeId = "node-active-reregister";
    const entry1 = issueNodeInstallCode({ deployment_id: DEPLOYMENT_ID, entity_id: ENTITY_ID });
    const first = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: entry1.install_code,
        node_id: nodeId,
        firmware_version: "1.0.0",
      },
    });
    expect(first.statusCode).toBe(200);
    const nodeToken = JSON.parse(first.body).node_token as string;

    const pending = getNode(DEPLOYMENT_ID, nodeId)!;
    upsertNodeInRegistry({ ...pending, name: "KeepMe" });
    activateNode(DEPLOYMENT_ID, nodeId);

    const entry2 = issueNodeInstallCode({ deployment_id: DEPLOYMENT_ID, entity_id: ENTITY_ID });
    const res = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: entry2.install_code,
        node_id: nodeId,
        firmware_version: "3.0.0",
        node_token: nodeToken,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("active");

    const updated = getNode(DEPLOYMENT_ID, nodeId)!;
    expect(updated.status).toBe("active");
    expect(updated.name).toBe("KeepMe");
    expect(updated.firmware_version).toBe("3.0.0");
  });

  it("fails with 400 when install code is bound to a different node_id", async () => {
    const entry = issueNodeInstallCode({
      deployment_id: DEPLOYMENT_ID,
      entity_id: ENTITY_ID,
      node_id: "node-a",
    });
    const res = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: entry.install_code,
        node_id: "node-b",
      },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("invalid");
  });
});

describe("POST /nodes/register rate limit", () => {
  let testDir: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    testDir = allocateAgentDataDir("nodes-route-rate-limit");
    seedCanonicalSimRegistry();
    app = Fastify();
    await app.register(rateLimit, { max: 1000, timeWindow: "1 minute" });
    await registerNodeRoutes(app);
  });

  afterEach(async () => {
    await app.close();
    releaseAgentDataDir(testDir);
  });

  it("returns 429 on the 11th request within one minute", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/nodes/register",
        payload: {
          deployment_id: DEPLOYMENT_ID,
          install_code: `DF-INVALID-${i}`,
          node_id: `node-rate-limit-${i}`,
        },
      });
      expect(res.statusCode).toBe(400);
    }

    const res = await app.inject({
      method: "POST",
      url: "/nodes/register",
      payload: {
        deployment_id: DEPLOYMENT_ID,
        install_code: "DF-INVALID-11",
        node_id: "node-rate-limit-11",
      },
    });
    expect(res.statusCode).toBe(429);
  });
});
