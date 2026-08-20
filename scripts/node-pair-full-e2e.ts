#!/usr/bin/env tsx
/**
 * 配对计划全链路 e2e：模拟器 --pair → MQTT 发码 → register → bind → MQTT 直发 command
 * （不经过 LLM；微信/语音交互须单独用真实 LLM 验证）
 *
 * 前置：API + MQTT broker 已运行（本脚本可 --start-api 自动拉起）
 *
 * 运行:
 *   ADMIN_TOKEN=dev-admin npm run pair:full:e2e
 *     默认拉起隔离 AGENT_DATA_DIR 的 API。
 *   ADMIN_TOKEN=dev-admin AGENT_DATA_DIR=.agentstack/dev-profiles/greenhouse/data npm run pair:full:e2e -- --attach
 *     显式附着运行中 API；结束时会从该目录 registry 清理本次 node。
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { deploymentScopedPath, nodeCommandTopic } from "@embodied-agent/platform";
import mqtt from "mqtt";

const API = process.env.API_URL ?? "http://127.0.0.1:3001";
const ADMIN = process.env.ADMIN_TOKEN ?? "dev-admin";
const MQTT_URL = process.env.MQTT_URL ?? "mqtt://127.0.0.1:1883";
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID ?? "dep-gh-pilot-001";
const GH = process.env.GREENHOUSE_ID ?? "gh-001";
const NODE_ID = process.env.NODE_ID ?? `node-pair-full-${Date.now().toString(36)}`;
const ATTACH = process.argv.includes("--attach");
const DATA_DIR = ATTACH
  ? process.env.AGENT_DATA_DIR
  : resolve("/tmp", `df-pair-full-e2e-${Date.now().toString(36)}`);

function devicesForNode(nodeId: string) {
  const suffix = nodeId.replace(/^node-/, "");
  return [
    {
      device_id: `sensor-${suffix}`,
      device_type: "sensor",
      name: "温湿度传感器",
      channel: "i2c:0x44",
      metrics: ["temperature_c", "humidity_percent"],
      status: "active",
    },
    {
      device_id: `vent-${suffix}`,
      device_type: "vent_motor",
      name: "左侧帘",
      channel: "relay:vent_left",
      default_for: "vent_motor",
      status: "active",
    },
    {
      device_id: `fan-${suffix}`,
      device_type: "fan",
      name: "风机",
      channel: "relay:fan_01",
      status: "active",
    },
  ];
}

function pruneE2eNode(dataDir: string, nodeId: string): void {
  const registryPath = resolve(dataDir, "device-registry.json");
  if (!existsSync(registryPath)) return;
  const reg = JSON.parse(readFileSync(registryPath, "utf8")) as {
    nodes?: { node_id: string }[];
    devices?: { node_id?: string }[];
  };
  reg.nodes = (reg.nodes ?? []).filter((n) => n.node_id !== nodeId);
  reg.devices = (reg.devices ?? []).filter((d) => d.node_id !== nodeId);
  writeFileSync(registryPath, `${JSON.stringify(reg, null, 2)}\n`, "utf8");

  const tokensPath = deploymentScopedPath(dataDir, DEPLOYMENT_ID, "node-tokens.json");
  if (!existsSync(tokensPath)) return;
  const tok = JSON.parse(readFileSync(tokensPath, "utf8")) as {
    tokens?: { deployment_id: string; node_id: string }[];
  };
  if (tok.tokens) {
    tok.tokens = tok.tokens.filter(
      (t) => t.deployment_id !== DEPLOYMENT_ID || t.node_id !== nodeId,
    );
  }
  writeFileSync(tokensPath, `${JSON.stringify(tok, null, 2)}\n`, "utf8");
}

function seedMinimalRegistry(dir: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    resolve(dir, "device-registry.json"),
    JSON.stringify(
      {
        deployments: [
          {
            deployment_id: DEPLOYMENT_ID,
            name: "守棚工长试点",
            timezone: "Asia/Shanghai",
            status: "active",
          },
        ],
        entities: [
          {
            deployment_id: DEPLOYMENT_ID,
            domain_id: "agriculture",
            entity_type: "greenhouse",
            entity_id: GH,
            name: "1 号棚",
            aliases: ["1号棚", "一号棚", "1棚"],
            status: "active",
          },
        ],
        nodes: [],
        devices: [],
      },
      null,
      2,
    ),
  );
}

async function adminFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("x-admin-token", ADMIN);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`admin ${path} ${res.status}: ${txt}`);
  }
  return res.json();
}

async function waitForHealth(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error(`API not ready at ${API}/health`);
}

function waitForEvent(
  child: ChildProcessWithoutNullStreams,
  event: string,
  timeoutMs = 60_000,
): Promise<void> {
  const marker = `::${event}::`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${marker}`)), timeoutMs);
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes(marker)) {
        clearTimeout(timer);
        child.stdout.off("data", onData);
        child.stderr.off("data", onData);
        resolve();
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
  });
}

async function freeApiPort() {
  const port = new URL(API).port || "3001";
  try {
    const { execSync } = await import("node:child_process");
    const pids = execSync(`lsof -ti:${port} 2>/dev/null || true`, { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), "SIGTERM");
      } catch {
        /* already gone */
      }
    }
    if (pids.length) {
      await sleep(800);
    }
  } catch {
    /* lsof unavailable */
  }
}

async function startApi(): Promise<ChildProcessWithoutNullStreams> {
  await freeApiPort();
  seedMinimalRegistry(DATA_DIR);
  console.log("[e2e] AGENT_DATA_DIR:", DATA_DIR);

  const child = spawn("npm", ["run", "start", "-w", "@embodied-agent/api"], {
    cwd: resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      AGENT_DATA_DIR: DATA_DIR,
      ADMIN_TOKEN: ADMIN,
      MQTT_URL,
      PORT: new URL(API).port || "3001",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => process.stdout.write(`[api] ${d}`));
  child.stderr.on("data", (d) => process.stderr.write(`[api] ${d}`));
  await waitForHealth();
  console.log("[e2e] API ready");
  return child;
}

async function main() {
  console.log("=== Node Pair Full E2E ===");
  console.log("node_id:", NODE_ID, "deployment:", DEPLOYMENT_ID, "gh:", GH);

  if (ATTACH) {
    if (!DATA_DIR) {
      throw new Error(
        "--attach 须显式设置 AGENT_DATA_DIR（与运行中 API 相同），结束时会清理本次 node",
      );
    }
    console.warn(`[e2e] --attach 模式：写入 ${DATA_DIR}，结束后清理 node_id=${NODE_ID}`);
  }

  let apiProc: ChildProcessWithoutNullStreams | null = null;
  if (!ATTACH) {
    apiProc = await startApi();
  } else {
    await waitForHealth();
  }

  const simProc = spawn(
    "npx",
    [
      "tsx",
      resolve(import.meta.dirname, "node-simulator.ts"),
      "--pair",
      "--test",
      "--exit-after=1",
    ],
    {
      env: {
        ...process.env,
        API_URL: API,
        ADMIN_TOKEN: ADMIN,
        MQTT_URL,
        DEPLOYMENT_ID,
        GREENHOUSE_ID: GH,
        NODE_ID,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  simProc.stdout.on("data", (d) => process.stdout.write(`[sim] ${d}`));
  simProc.stderr.on("data", (d) => process.stderr.write(`[sim] ${d}`));

  try {
    console.log("[e2e] 1/6 等待模拟器进入 pairing 订阅…");
    await waitForEvent(simProc, "WAITING_FOR_PAIR");

    console.log("[e2e] 2/6 管理员 MQTT 下发配对码…");
    const pairRes = await adminFetch(`/admin/nodes/${encodeURIComponent(NODE_ID)}/pair`, {
      method: "POST",
      body: JSON.stringify({ deployment_id: DEPLOYMENT_ID, entity_id: GH, ttl_minutes: 10 }),
    });
    console.log("::PAIR_ISSUED::", pairRes.install_code, "mqtt:", pairRes.mqtt_published);
    if (!pairRes.mqtt_published) {
      throw new Error("pair API did not publish to MQTT");
    }

    console.log("[e2e] 3/6 等待模拟器收码并 register…");
    await waitForEvent(simProc, "REGISTERED");

    console.log("[e2e] 4/6 管理员确认绑定…");
    const bindRes = await adminFetch(`/admin/nodes/${encodeURIComponent(NODE_ID)}/binding`, {
      method: "PUT",
      body: JSON.stringify({
        deployment_id: DEPLOYMENT_ID,
        entity_id: GH,
        devices: devicesForNode(NODE_ID),
      }),
    });
    console.log("::BOUND::", bindRes.node?.status, "cv=", bindRes.node?.config_version);

    console.log("[e2e] 5/6 等待模拟器 config_applied + READY…");
    await waitForEvent(simProc, "READY");

    console.log("[e2e] 6/6 MQTT 直发 command（控制面，不经过 LLM）…");
    const ventId = `vent-${NODE_ID.replace(/^node-/, "")}`;
    const cv = bindRes.node?.config_version ?? 1;
    const commandId = `cmd-pair-full-e2e-${Date.now()}`;
    const now = new Date().toISOString();
    const cmd = {
      message_type: "command",
      protocol_version: "0.1",
      command_id: commandId,
      idempotency_key: `${DEPLOYMENT_ID}:pair-full-e2e:${ventId}:${now}`,
      deployment_id: DEPLOYMENT_ID,
      node_id: NODE_ID,
      config_version: cv,
      device_id: ventId,
      device_type: "vent_motor",
      action: "open",
      parameters: { duration_seconds: 5 },
      issued_by: {
        user_id: "pair-full-e2e",
        role: "owner",
        platform: "e2e",
        conversation_id: "pair-full-e2e",
      },
      created_at: now,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const mqttClient = mqtt.connect(MQTT_URL);
    await new Promise<void>((resolve, reject) => {
      mqttClient.once("connect", () => resolve());
      mqttClient.once("error", reject);
    });
    const topic = nodeCommandTopic(DEPLOYMENT_ID, NODE_ID);
    await new Promise<void>((resolve, reject) => {
      mqttClient.publish(topic, JSON.stringify(cmd), (err) => (err ? reject(err) : resolve()));
    });
    console.log("::MQTT_COMMAND_PUBLISHED::", commandId, ventId);
    mqttClient.end();

    console.log("[e2e] 等待模拟器执行命令…");
    await waitForEvent(simProc, "TEST_PASSED", 90_000);

    console.log("=== PAIR FULL E2E SUCCESS ===");
    process.exitCode = 0;
  } finally {
    simProc.kill("SIGTERM");
    if (apiProc) apiProc.kill("SIGTERM");
    if (ATTACH && DATA_DIR) {
      pruneE2eNode(DATA_DIR, NODE_ID);
      console.log("[e2e] 已清理 registry/node-tokens:", NODE_ID);
    }
  }
}

main().catch((e) => {
  console.error("PAIR FULL E2E FAILED:", e);
  process.exit(1);
});
