#!/usr/bin/env tsx
/**
 * Scene Node Simulator (用于无真实 ESP32 硬件时验证完整闭环)
 *
 * 功能：
 * - 使用安装码自注册（或自动生成安装码）
 * - 订阅 retained config topic
 * - 收到 config 后“应用”，上报 config_applied
 * - 订阅 commands topic
 * - 收到命令后校验 config_version + device_id，模拟执行并上报完整 lifecycle events
 * - 周期上报 telemetry（新 readings[] 格式） + heartbeat（带 node_id）
 *
 * 用法示例（推荐配合 Settings 页面或 curl 做绑定）：
 *
 * 终端1（API + Mosquitto）:
 *   docker compose up -d mosquitto
 *   ADMIN_TOKEN=dev-admin npm run api:dev
 *
 * 终端2（本模拟器）:
 *   # 方式A：自己生成安装码并注册
 *   ADMIN_TOKEN=dev-admin npx tsx scripts/node-simulator.ts
 *
 *   # 方式B：已有安装码
 *   INSTALL_CODE=DF-123456 NODE_ID=node-gh-001-a npx tsx scripts/node-simulator.ts
 *
 * 自动化测试支持（推荐用于 e2e / CI）:
 *   # 自动生成码 + 测试模式 + 执行 2 条命令后自动退出成功
 *   ADMIN_TOKEN=dev-admin npx tsx scripts/node-simulator.ts --auto --test --exit-after=2
 *
 *   # 只用已有安装码跑测试
 *   INSTALL_CODE=DF-XXXX npx tsx scripts/node-simulator.ts --test --exit-after=1
 *
 *   # MQTT 配对模式（等同固件：订阅 pairing topic → 收码 → register → 常驻）
 *   NODE_ID=node-demo-001 npx tsx scripts/node-simulator.ts --pair --test --exit-after=1
 *   # 管理员在配对页点「MQTT 下发」或 pair API 后自动注册
 *
 * 输出结构化事件（方便测试脚本 grep）:
 *   ::WAITING_FOR_PAIR:: ...
 *   ::PAIRING_CODE_RECEIVED:: ...
 *   ::REGISTERED:: {"node_id":"..."}
 *   ::CONFIG_APPLIED:: ...
 *   ::READY::
 *   ::COMMAND_COMPLETED:: ...
 *   ::TEST_PASSED:: {"completed_commands":2}
 *
 * 然后在 Settings 页面（或 curl）把这个 node 绑定到 dep-gh-pilot-001 / gh-001。
 * 绑定成功后模拟器会自动收到 config 并 ack，然后可以发控制指令。
 *
 * 多节点并行（不同 NODE_ID 可同时运行，仅同一 NODE_ID 互斥）:
 *   NODE_ID=node-sim-gh-001 npx tsx scripts/node-simulator.ts
 *   NODE_ID=node-sim-gh-002 GREENHOUSE_ID=gh-002 npx tsx scripts/node-simulator.ts
 *
 * 模拟执行时长（默认最长等 8s，completed 上报真实等待秒数）:
 *   SIM_MAX_COMMAND_MS=3000 npx tsx scripts/node-simulator.ts
 *   npx tsx scripts/node-simulator.ts --realtime   # 按指令完整 duration 等待
 */

import {
  deploymentScopedPath,
  mqttConnectOptions,
  nodeCommandTopic,
  nodeConfigTopic,
  nodeEventsTopic,
  nodeHeartbeatTopic,
  nodeTelemetryTopic,
  pairingInstallCodeTopic,
  resolveAgentDataDir,
} from "@embodied-agent/platform";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import mqtt, { type MqttClient } from "mqtt";
import { setTimeout as sleep } from "node:timers/promises";
import {
  assertSimDurationReport,
  buildCompletedResult,
  elapsedSeconds,
  requiresPulseDuration,
  resolveCommandSleepMs,
  resolveSimMaxCommandMs,
} from "./lib/sim-command.js";
import {
  applySimCommandActuators,
  createRhythm,
  initSimTelemetry,
  readSimActuators,
  releaseSimCommandActuators,
  resolveRhythmCliValue,
  tickIndustrialSimTelemetry,
  tickSimTelemetry,
  type Rhythm,
  type SimTelemetryProfile,
} from "./lib/sim-telemetry.js";

const API = process.env.API_URL ?? "http://127.0.0.1:3001";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "dev-admin";
const MQTT_URL = process.env.MQTT_URL ?? "mqtt://127.0.0.1:1883";

// === Automation / Test support ===
function parseArgs() {
  const args = process.argv.slice(2);
  const opts: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > -1) {
        opts[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        opts[a.slice(2)] = true;
      }
    }
  }
  return opts;
}

const cli = parseArgs();
const SIM_PROFILE_RAW = typeof cli.profile === "string" ? cli.profile : "greenhouse";
if (SIM_PROFILE_RAW !== "greenhouse" && SIM_PROFILE_RAW !== "industrial") {
  throw new Error(`unknown --profile=${SIM_PROFILE_RAW} (expected greenhouse|industrial)`);
}
const SIM_PROFILE = SIM_PROFILE_RAW as SimTelemetryProfile;
const RHYTHM_OPTS = resolveRhythmCliValue(cli.rhythm);
if (RHYTHM_OPTS && process.env.SIM_TELEMETRY_REACT !== "1") {
  // 节律越界靠指令响应（react）平息；react 未开会永久卡在 excursion。失败可见，不静默强制开启。
  throw new Error("--rhythm requires SIM_TELEMETRY_REACT=1 (excursions resolve via command react)");
}
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID ?? "dep-gh-pilot-001";
const GREENHOUSE_ID = process.env.GREENHOUSE_ID ?? "gh-001";
const CABINET_ID = process.env.CABINET_ID ?? process.env.ENTITY_ID ?? "cabinet-001";
const ENTITY_ID = SIM_PROFILE === "industrial" ? CABINET_ID : GREENHOUSE_ID;
const TEST_MODE = cli.test === true || cli.headless === true || !!cli["exit-after"];
const EXIT_AFTER = Number(cli["exit-after"] || 0);
const AUTO_REGISTER = cli.auto === true || cli["auto-register"] === true || !!cli.auto;
const PAIR_MODE = cli.pair === true;
const REALTIME_SIM = cli.realtime === true;
/** 开发模拟最长等待（毫秒）；0 表示按指令完整时长。可用 SIM_MAX_COMMAND_MS 或 --realtime 覆盖。 */
const SIM_MAX_COMMAND_MS = resolveSimMaxCommandMs({
  realtime: REALTIME_SIM,
  envValue: process.env.SIM_MAX_COMMAND_MS,
});

const CANONICAL_NODE_ID = "node-sim-gh-001";
const NODE_ID =
  process.env.NODE_ID ?? (TEST_MODE ? `node-sim-${Date.now().toString(36)}` : CANONICAL_NODE_ID);
let INSTALL_CODE = process.env.INSTALL_CODE;

let completedCommands = 0;

initSimTelemetry(NODE_ID, process.env.SIM_TELEMETRY_SCENARIO, GREENHOUSE_ID, SIM_PROFILE);
const rhythmScenario = SIM_PROFILE === "industrial" ? "overheat" : "high_temp";
let rhythm: Rhythm | undefined;
if (RHYTHM_OPTS) {
  rhythm = createRhythm({
    ...RHYTHM_OPTS,
    scenario: rhythmScenario,
    now: () => Date.now(),
  });
  console.log(
    "[sim] rhythm enabled:",
    `${RHYTHM_OPTS.minIntervalMs / 60_000}-${RHYTHM_OPTS.maxIntervalMs / 60_000}m`,
    "scenario:",
    rhythmScenario,
    "next excursion:",
    new Date(rhythm.getNextExcursionAt() ?? 0).toISOString(),
  );
}
if (process.env.SIM_TELEMETRY_SCENARIO || process.env.SIM_TELEMETRY_REACT === "1" || rhythm) {
  console.log(
    "[sim] telemetry scenario:",
    process.env.SIM_TELEMETRY_SCENARIO ?? "default",
    SIM_PROFILE === "industrial" ? "cabinet:" : "gh:",
    ENTITY_ID,
    "react:",
    process.env.SIM_TELEMETRY_REACT === "1",
  );
}

function emit(event: string, data: Record<string, unknown> = {}) {
  const line = `::${event}::` + (Object.keys(data).length ? " " + JSON.stringify(data) : "");
  console.log(line);
  if (TEST_MODE && event === "COMMAND_COMPLETED" && EXIT_AFTER > 0) {
    completedCommands++;
    if (completedCommands >= EXIT_AFTER) {
      emit("TEST_PASSED", { completed_commands: completedCommands });
      process.exit(0);
    }
  }
}

interface LocalDevice {
  device_id: string;
  device_type: string;
  channel?: string;
  actions?: string[];
  max_duration_seconds?: number;
}

interface NodeConfig {
  config_version: number;
  devices?: LocalDevice[];
  [key: string]: unknown;
}

interface CommandMessage {
  command_id?: string;
  idempotency_key?: string;
  device_id?: string;
  action?: string;
  config_version?: number;
  node_token?: string;
  expires_at?: string;
  duration_seconds?: number;
  issued_by?: { conversation_id?: string; [key: string]: unknown };
  parameters?: { duration_seconds?: number; [key: string]: unknown };
  [key: string]: unknown;
}

interface TelemetryPayload {
  message_type: "telemetry";
  protocol_version: string;
  deployment_id: string;
  node_id: string;
  config_version: number;
  reported_at: string;
  readings: Array<{ device_id: string; metric: string; value: number }>;
  node_token: string;
  [key: string]: unknown;
}

interface HeartbeatPayload {
  message_type: "heartbeat";
  protocol_version: string;
  deployment_id: string;
  node_id: string;
  firmware_version: string;
  config_version: number;
  uptime_ms: number;
  wifi_rssi: number;
  reported_at: string;
  node_token: string;
  [key: string]: unknown;
}

interface NodeEventPayload {
  message_type: string;
  protocol_version: string;
  event_id?: string;
  command_id?: string;
  idempotency_key?: string;
  deployment_id?: string;
  node_id?: string;
  device_id?: string;
  status?: string;
  node_token?: string;
  [key: string]: unknown;
}

let localConfigVersion = 0;
let localDevices: LocalDevice[] = [];
let nodeToken: string | null = null;

function simDataRoot(): string {
  return resolveAgentDataDir();
}

function loadPersistedNodeToken(nodeId: string): string | null {
  if (process.env.NODE_TOKEN) return process.env.NODE_TOKEN;
  const tokensPath = deploymentScopedPath(simDataRoot(), DEPLOYMENT_ID, "node-tokens.json");
  if (!existsSync(tokensPath)) return null;
  try {
    const file = JSON.parse(readFileSync(tokensPath, "utf8")) as {
      tokens?: { deployment_id: string; node_id: string; token: string }[];
    };
    return (
      file.tokens?.find((t) => t.deployment_id === DEPLOYMENT_ID && t.node_id === nodeId)?.token ??
      null
    );
  } catch {
    return null;
  }
}

async function adminFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("x-admin-token", ADMIN_TOKEN);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`admin ${path} failed: ${res.status} ${err}`);
  }
  return res.json();
}

async function nodeFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`node ${path} failed: ${res.status} ${err}`);
  }
  return res.json();
}

async function ensureInstallCode(): Promise<string> {
  if (INSTALL_CODE) return INSTALL_CODE;

  if (!AUTO_REGISTER && !ADMIN_TOKEN) {
    throw new Error("没有 INSTALL_CODE 且未开启 --auto，需要 ADMIN_TOKEN 环境变量来自动生成");
  }

  console.log("[sim] 自动生成安装码...");
  const res = await adminFetch("/admin/node-install-codes", {
    method: "POST",
    body: JSON.stringify({
      deployment_id: DEPLOYMENT_ID,
      entity_id: ENTITY_ID,
      ttl_minutes: 10,
    }),
  });
  INSTALL_CODE = res.install_code;
  console.log("[sim] 已生成安装码:", INSTALL_CODE);
  emit("INSTALL_CODE_GENERATED", { code: INSTALL_CODE });
  return INSTALL_CODE;
}

async function waitForPairingCode(client: MqttClient, timeoutMs = 120_000): Promise<string> {
  const topic = pairingInstallCodeTopic(DEPLOYMENT_ID, NODE_ID);
  emit("WAITING_FOR_PAIR", { topic, node_id: NODE_ID });
  console.log(`[sim] --pair：订阅 ${topic}，等待 MQTT 下发安装码…`);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timeout waiting pairing install_code on MQTT")),
      timeoutMs,
    );
    const onMessage = (t: string, buf: Buffer) => {
      if (t !== topic) return;
      clearTimeout(timer);
      client.off("message", onMessage);
      let raw: { install_code?: string };
      try {
        raw = JSON.parse(buf.toString());
      } catch {
        reject(new Error("invalid pairing payload JSON"));
        return;
      }
      if (!raw.install_code) {
        reject(new Error("pairing payload missing install_code"));
        return;
      }
      INSTALL_CODE = raw.install_code;
      emit("PAIRING_CODE_RECEIVED", { install_code: INSTALL_CODE });
      resolve(INSTALL_CODE);
    };
    client.subscribe(topic, (err) => {
      if (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
    client.on("message", onMessage);
  });
}

async function connectMqtt(): Promise<MqttClient> {
  const client: MqttClient = mqtt.connect(MQTT_URL, mqttConnectOptions(MQTT_URL));
  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => {
      console.log("[sim] MQTT 已连接");
      resolve();
    });
    client.once("error", reject);
  });
  return client;
}

function simLockDir(): string {
  return resolve(resolveAgentDataDir(), ".sim-locks");
}

function isProcessAlive(pid: string): boolean {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch {
    return false;
  }
}

/** 同一 NODE_ID 仅允许一个模拟器；不同 NODE_ID 可并行（如 gh-001 + gh-002）。 */
function acquireSimulatorLock(): void {
  const dir = simLockDir();
  mkdirSync(dir, { recursive: true });
  const lockFile = resolve(dir, `${NODE_ID}.pid`);
  if (existsSync(lockFile)) {
    const existingPid = readFileSync(lockFile, "utf8").trim();
    if (existingPid && existingPid !== String(process.pid) && isProcessAlive(existingPid)) {
      throw new Error(
        `已有 node-simulator 在运行同一节点 ${NODE_ID}（pid=${existingPid}），请先停止后再启动`,
      );
    }
    unlinkSync(lockFile);
  }
  writeFileSync(lockFile, String(process.pid));
}

function releaseSimulatorLock(): void {
  const lockFile = resolve(simLockDir(), `${NODE_ID}.pid`);
  if (!existsSync(lockFile)) return;
  const pid = readFileSync(lockFile, "utf8").trim();
  if (pid === String(process.pid)) unlinkSync(lockFile);
}

type RegistryNode = {
  node_id: string;
  status: string;
  config_version?: number;
  entity_id?: string;
};

async function lookupNode(nodeId: string): Promise<RegistryNode | null> {
  for (const status of ["active", "pending", "disabled", "maintenance"] as const) {
    try {
      const res = await adminFetch(`/admin/nodes?status=${status}`);
      const hit = (res.nodes || []).find((n: RegistryNode) => n.node_id === nodeId);
      if (hit) return hit;
    } catch {
      /* API 未就绪时视为未知 */
    }
  }
  return null;
}

function simDeviceActions(device_type: string): string[] | undefined {
  if (device_type === "vent_motor") return ["open", "close", "stop"];
  if (device_type === "fan") return ["start", "stop"];
  return undefined;
}

/** active 节点附着时 aedes 常无 retained config，从 registry 补齐 localDevices。 */
async function hydrateLocalDevicesFromRegistry(): Promise<void> {
  try {
    const registry = (await adminFetch("/admin/registry")) as {
      devices?: Array<{
        node_id?: string;
        device_id: string;
        device_type: string;
        channel?: string;
        metrics?: string[];
        max_duration_seconds?: number;
      }>;
    };
    const devs = (registry.devices ?? [])
      .filter((d) => d.node_id === NODE_ID)
      .map((d) => ({
        device_id: d.device_id,
        device_type: d.device_type,
        channel: d.channel,
        metrics: d.metrics,
        actions: simDeviceActions(d.device_type),
        max_duration_seconds: d.max_duration_seconds,
      }));
    if (devs.length === 0) return;
    localDevices = devs;
    console.log(
      `[sim] 从 registry 加载设备（${localDevices.length} 台，cv=${localConfigVersion}）`,
    );
    localDevices.forEach((d) => console.log("   -", d.device_id, d.channel ?? ""));
  } catch (e) {
    console.warn(
      "[sim] registry 设备加载失败，等待 MQTT config：",
      e instanceof Error ? e.message : e,
    );
  }
}

async function prepareNode(client: MqttClient): Promise<"attached" | "registered"> {
  acquireSimulatorLock();

  const existing = await lookupNode(NODE_ID);
  if (existing?.status === "active") {
    const cv =
      typeof existing.config_version === "number" && existing.config_version > 0
        ? existing.config_version
        : 1;
    localConfigVersion = cv;
    await hydrateLocalDevicesFromRegistry();
    nodeToken = loadPersistedNodeToken(NODE_ID);
    console.log(`[sim] 节点 ${NODE_ID} 已 active (cv=${cv})，跳过注册，直接附着 MQTT`);
    if (nodeToken) {
      console.log(`[sim] 已加载 node_token (${nodeToken.slice(0, 16)}…)`);
    } else {
      throw new Error(
        `[sim] active 节点 ${NODE_ID} 缺少 node_token；运行 ensure-sim-node-tokens.ts 后重启模拟器`,
      );
    }
    emit("ATTACHED", {
      node_id: NODE_ID,
      status: "active",
      config_version: cv,
    });
    return "attached";
  }
  if (existing?.status === "pending") {
    console.log(`[sim] 节点 ${NODE_ID} 待绑定，附着 MQTT 等待管理员确认`);
    emit("ATTACHED", { node_id: NODE_ID, status: "pending" });
    return "attached";
  }

  const shouldPair =
    PAIR_MODE || (!AUTO_REGISTER && !INSTALL_CODE && NODE_ID === CANONICAL_NODE_ID);
  if (shouldPair) {
    console.log("[sim] 未找到已注册节点，进入 MQTT 配对注册…");
    await waitForPairingCode(client);
  } else if (!INSTALL_CODE && !AUTO_REGISTER) {
    throw new Error(
      "节点未注册：请使用 --pair、--auto、INSTALL_CODE=...，或确保 registry 中已有 active 节点",
    );
  }

  await register();
  return "registered";
}

async function register() {
  const code = await ensureInstallCode();
  console.log(`[sim] 使用安装码注册 node_id=${NODE_ID} ...`);

  const capabilities =
    SIM_PROFILE === "industrial"
      ? {
          sensors: [{ channel: "i2c:0x48", metrics: ["temperature_c"] }],
          actuators: [{ channel: "relay:exhaust", device_type: "fan", actions: ["start", "stop"] }],
        }
      : {
          sensors: [{ channel: "i2c:0x44", metrics: ["temperature_c", "humidity_percent"] }],
          actuators: [
            {
              channel: "relay:vent_left",
              device_type: "vent_motor",
              actions: ["open", "close", "stop"],
            },
            { channel: "relay:fan_01", device_type: "fan", actions: ["start", "stop"] },
          ],
        };

  // 自动化模式下增加一点重试，适应 tmux 中 API 启动慢的情况
  let reg;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      reg = await nodeFetch("/nodes/register", {
        method: "POST",
        body: JSON.stringify({
          deployment_id: DEPLOYMENT_ID,
          install_code: code,
          node_id: NODE_ID,
          firmware_version: "sim-0.3.0",
          capabilities,
        }),
      });
      break;
    } catch (e) {
      if (attempt === 5) throw e;
      console.log(`[sim] 注册失败 (attempt ${attempt}/5)，等待 API 就绪...`);
      await sleep(1500);
    }
  }

  nodeToken = reg.node_token;
  console.log("[sim] 注册成功，进入 pending");
  emit("REGISTERED", {
    node_id: NODE_ID,
    status: reg.status,
    deployment_id: reg.deployment_id,
    entity_id: reg.entity_id,
  });
}

async function publishEvent(client: MqttClient, event: NodeEventPayload) {
  const topic = nodeEventsTopic(DEPLOYMENT_ID, NODE_ID);
  client.publish(topic, JSON.stringify({ ...event, node_token: requireNodeToken() }));
}

function requireNodeToken(): string {
  if (!nodeToken) {
    throw new Error(`[sim] ${NODE_ID} 缺少 node_token，拒绝发布 MQTT 消息。`);
  }
  return nodeToken;
}

function defaultSensorDeviceId(): string {
  const fromConfig = localDevices.find((d) => d.device_type === "sensor")?.device_id;
  if (fromConfig) return fromConfig;
  return `sensor-${NODE_ID.replace(/^node-/, "")}`;
}

function actuatorDeviceId(deviceType: "vent_motor" | "fan"): string | undefined {
  return localDevices.find((d) => d.device_type === deviceType)?.device_id;
}

async function publishTelemetry(client: MqttClient) {
  if (localConfigVersion <= 0) return;
  rhythm?.tick(NODE_ID);
  const sensorId = defaultSensorDeviceId();
  const actuators = readSimActuators(NODE_ID);
  const topic = nodeTelemetryTopic(DEPLOYMENT_ID, NODE_ID);
  const readings: Array<{ device_id: string; metric: string; value: number }> = [];

  if (SIM_PROFILE === "industrial") {
    const telem = tickIndustrialSimTelemetry(NODE_ID);
    readings.push({ device_id: sensorId, metric: "temperature_c", value: telem.temperature_c });
    const fanId = actuatorDeviceId("fan");
    if (fanId) {
      readings.push({ device_id: fanId, metric: "relay_state", value: actuators.fan ? 1 : 0 });
    }
  } else {
    const ventId = actuatorDeviceId("vent_motor");
    const fanId = actuatorDeviceId("fan");
    const telem = tickSimTelemetry(NODE_ID);
    readings.push(
      { device_id: sensorId, metric: "temperature_c", value: telem.temperature_c },
      { device_id: sensorId, metric: "humidity_percent", value: telem.humidity_percent },
    );
    if (ventId) {
      readings.push({ device_id: ventId, metric: "relay_state", value: actuators.vent ? 1 : 0 });
    }
    if (fanId) {
      readings.push({ device_id: fanId, metric: "relay_state", value: actuators.fan ? 1 : 0 });
    }
  }

  const payload: TelemetryPayload = {
    message_type: "telemetry",
    protocol_version: "0.1",
    deployment_id: DEPLOYMENT_ID,
    node_id: NODE_ID,
    config_version: localConfigVersion,
    reported_at: new Date().toISOString(),
    readings,
    node_token: requireNodeToken(),
  };
  client.publish(topic, JSON.stringify(payload));
  console.log("[sim] 发布 telemetry (readings 格式)");
}

async function publishHeartbeat(client: MqttClient) {
  const topic = nodeHeartbeatTopic(DEPLOYMENT_ID, NODE_ID);
  const payload: HeartbeatPayload = {
    message_type: "heartbeat",
    protocol_version: "0.1",
    deployment_id: DEPLOYMENT_ID,
    node_id: NODE_ID,
    firmware_version: "sim-0.3.0",
    config_version: localConfigVersion,
    uptime_ms: Math.floor(process.uptime() * 1000),
    wifi_rssi: -52,
    reported_at: new Date().toISOString(),
    node_token: requireNodeToken(),
  };
  const simLat = process.env.SIM_GPS_LATITUDE;
  const simLng = process.env.SIM_GPS_LONGITUDE;
  if (simLat && simLng) {
    const latitude = Number(simLat);
    const longitude = Number(simLng);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      payload.gps = {
        latitude,
        longitude,
        accuracy_m: Number(process.env.SIM_GPS_ACCURACY_M ?? "8"),
        fix_quality: 2,
      };
    }
  }
  client.publish(topic, JSON.stringify(payload));
}

async function applyConfig(config: NodeConfig) {
  localConfigVersion = config.config_version;
  localDevices = config.devices || [];
  console.log(`[sim] 收到 config (cv=${localConfigVersion})，设备数=${localDevices.length}`);
  localDevices.forEach((d) => console.log("   -", d.device_id, d.channel));

  emit("CONFIG_RECEIVED", { config_version: localConfigVersion, devices: localDevices.length });

  // 上报应用成功
  const event = {
    message_type: "node_event",
    protocol_version: "0.1",
    event_id: `evt-config-${NODE_ID}-${Date.now()}`,
    event_type: "config_applied",
    deployment_id: DEPLOYMENT_ID,
    node_id: NODE_ID,
    config_version: localConfigVersion,
    occurred_at: new Date().toISOString(),
  };
  await sleep(120);
  emit("CONFIG_APPLIED", { config_version: localConfigVersion });
  return event;
}

function commandTokenValid(cmd: { node_token?: string }): boolean {
  const expected = requireNodeToken();
  const provided = typeof cmd.node_token === "string" ? cmd.node_token : "";
  return provided.length > 0 && provided === expected;
}

function commandExpired(cmd: { expires_at?: string }): boolean {
  const expires = typeof cmd.expires_at === "string" ? cmd.expires_at : "";
  if (!expires) return true;
  const expiryMs = Date.parse(expires);
  if (!Number.isFinite(expiryMs)) return true;
  return Date.now() > expiryMs;
}

async function handleCommand(client: MqttClient, raw: CommandMessage) {
  const cmd = raw;
  console.log("[sim] 收到 command:", cmd.device_id, cmd.action, "cv=", cmd.config_version);

  if (!commandTokenValid(cmd)) {
    await publishEvent(client, {
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: `evt-${cmd.command_id}-rej`,
      command_id: cmd.command_id,
      idempotency_key: cmd.idempotency_key,
      deployment_id: DEPLOYMENT_ID,
      node_id: NODE_ID,
      device_id: cmd.device_id,
      status: "rejected",
      error: { code: "invalid_node_token", message: "node_token missing or invalid" },
      occurred_at: new Date().toISOString(),
    });
    return;
  }

  if (commandExpired(cmd)) {
    await publishEvent(client, {
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: `evt-${cmd.command_id}-rej`,
      command_id: cmd.command_id,
      idempotency_key: cmd.idempotency_key,
      deployment_id: DEPLOYMENT_ID,
      node_id: NODE_ID,
      device_id: cmd.device_id,
      status: "rejected",
      error: { code: "command_expired", message: "command expires_at is in the past" },
      occurred_at: new Date().toISOString(),
    });
    return;
  }

  if (cmd.config_version !== localConfigVersion) {
    await publishEvent(client, {
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: `evt-${cmd.command_id}-rej`,
      command_id: cmd.command_id,
      idempotency_key: cmd.idempotency_key,
      deployment_id: DEPLOYMENT_ID,
      node_id: NODE_ID,
      device_id: cmd.device_id,
      status: "rejected",
      error: { code: "config_version_mismatch", message: `expected ${localConfigVersion}` },
      occurred_at: new Date().toISOString(),
    });
    return;
  }

  const flywheelFailConv =
    typeof cmd.issued_by?.conversation_id === "string" &&
    cmd.issued_by.conversation_id.startsWith("flywheel-fail");
  if (flywheelFailConv) {
    await publishEvent(client, {
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: `evt-${cmd.command_id}-fail`,
      command_id: cmd.command_id,
      idempotency_key: cmd.idempotency_key,
      deployment_id: DEPLOYMENT_ID,
      node_id: NODE_ID,
      device_id: cmd.device_id,
      status: "failed",
      error: { code: "flywheel_sim_reject", message: "飞轮联调模拟失败" },
      occurred_at: new Date().toISOString(),
    });
    emit("COMMAND_FAILED", { device_id: cmd.device_id, command_id: cmd.command_id });
    return;
  }

  const dev = localDevices.find((d) => d.device_id === cmd.device_id);
  if (!dev) {
    await publishEvent(client, {
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: `evt-${cmd.command_id}-rej`,
      command_id: cmd.command_id,
      idempotency_key: cmd.idempotency_key,
      deployment_id: DEPLOYMENT_ID,
      node_id: NODE_ID,
      device_id: cmd.device_id,
      status: "rejected",
      error: { code: "unknown_device", message: "device not in current config" },
      occurred_at: new Date().toISOString(),
    });
    return;
  }

  const durationSeconds = cmd.parameters?.duration_seconds;
  if (
    requiresPulseDuration(cmd.action) &&
    (typeof durationSeconds !== "number" ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0)
  ) {
    await publishEvent(client, {
      message_type: "command_event",
      protocol_version: "0.1",
      event_id: `evt-${cmd.command_id}-rej`,
      command_id: cmd.command_id,
      idempotency_key: cmd.idempotency_key,
      deployment_id: DEPLOYMENT_ID,
      node_id: NODE_ID,
      device_id: cmd.device_id,
      status: "rejected",
      error: {
        code: "missing_duration_seconds",
        message: "pulse action requires positive duration_seconds",
      },
      occurred_at: new Date().toISOString(),
    });
    return;
  }

  // 模拟执行流程
  await publishEvent(client, {
    message_type: "command_event",
    protocol_version: "0.1",
    event_id: `evt-${cmd.command_id}-ack`,
    command_id: cmd.command_id,
    idempotency_key: cmd.idempotency_key,
    deployment_id: DEPLOYMENT_ID,
    node_id: NODE_ID,
    device_id: cmd.device_id,
    status: "acknowledged",
    occurred_at: new Date().toISOString(),
  });

  await publishEvent(client, {
    message_type: "command_event",
    protocol_version: "0.1",
    event_id: `evt-${cmd.command_id}-run`,
    command_id: cmd.command_id,
    idempotency_key: cmd.idempotency_key,
    deployment_id: DEPLOYMENT_ID,
    node_id: NODE_ID,
    device_id: cmd.device_id,
    status: "running",
    ...(typeof durationSeconds === "number" ? { runtime_limit_seconds: durationSeconds } : {}),
    occurred_at: new Date().toISOString(),
  });

  const requestedSeconds = typeof durationSeconds === "number" ? durationSeconds : undefined;
  applySimCommandActuators(NODE_ID, cmd);

  const sleepMs = resolveCommandSleepMs({
    action: cmd.action,
    durationSeconds: requestedSeconds,
    maxCommandMs: SIM_MAX_COMMAND_MS,
  });
  const startedAt = Date.now();
  if (sleepMs > 0) await sleep(sleepMs);

  releaseSimCommandActuators(NODE_ID, cmd);
  const actualSeconds = elapsedSeconds(startedAt, Date.now());
  if (requestedSeconds !== undefined && cmd.action !== "stop") {
    assertSimDurationReport(requestedSeconds, actualSeconds, SIM_MAX_COMMAND_MS);
  }
  const result = buildCompletedResult(cmd.action, actualSeconds);

  await publishEvent(client, {
    message_type: "command_event",
    protocol_version: "0.1",
    event_id: `evt-${cmd.command_id}-done`,
    command_id: cmd.command_id,
    idempotency_key: cmd.idempotency_key,
    deployment_id: DEPLOYMENT_ID,
    node_id: NODE_ID,
    device_id: cmd.device_id,
    status: "completed",
    result,
    occurred_at: new Date().toISOString(),
  });

  console.log("[sim] 命令执行完成:", cmd.device_id);
  emit("COMMAND_COMPLETED", { device_id: cmd.device_id, command_id: cmd.command_id });
}

function startSimulatorLoops(client: MqttClient) {
  setInterval(() => publishTelemetry(client), 15000);
  setInterval(() => publishHeartbeat(client), 20000);
  setTimeout(() => publishHeartbeat(client), 3000);
}

async function main() {
  console.log("=== Embodied Agent Scene Node Simulator ===");
  console.log(
    "node_id:",
    NODE_ID,
    "deployment:",
    DEPLOYMENT_ID,
    "profile:",
    SIM_PROFILE,
    "entity:",
    ENTITY_ID,
  );
  if (PAIR_MODE) console.log("mode: --pair (MQTT pairing → register)");

  const client = await connectMqtt();
  const mode = await prepareNode(client);
  if (mode === "attached") {
    console.log("[sim] 已附着到既有节点，等待 retained config / 命令…");
  }

  const configTopic = nodeConfigTopic(DEPLOYMENT_ID, NODE_ID);
  const commandsTopic = nodeCommandTopic(DEPLOYMENT_ID, NODE_ID);

  client.subscribe([configTopic, commandsTopic], (err) => {
    if (err) console.error("subscribe error", err);
    else console.log("[sim] 已订阅 config + commands");
  });

  // 处理 incoming
  // per-device Promise 链串行化：真实物理设备执行机构本身串行，
  // 同一 device 短时间到达多条 command 必须按序执行，避免并发写坏
  // sim-telemetry 的 actuator Map。仅对 commandsTopic 生效；config 等保持原样。
  const deviceQueues = new Map<string, Promise<void>>();
  client.on("message", async (topic, payload) => {
    const raw = JSON.parse(payload.toString());

    if (topic === configTopic) {
      const appliedEvent = await applyConfig(raw);
      await publishEvent(client, appliedEvent);
      console.log("[sim] config_applied 已上报");
      emit("READY", { node_id: NODE_ID, config_version: localConfigVersion });
      if (TEST_MODE) {
        console.log("::SIMULATOR_READY:: 可以进行绑定和测试");
      }
      return;
    }

    if (topic === commandsTopic) {
      const deviceId = raw.device_id;
      const prev = deviceQueues.get(deviceId) ?? Promise.resolve();
      const next = prev.then(() => handleCommand(client, raw)).catch(() => {});
      deviceQueues.set(deviceId, next);
      // 不 await next，让 mqtt.js 事件循环继续接收新 message；
      // 串行性由 per-device Promise 链保证。
    }
  });

  startSimulatorLoops(client);

  if (!TEST_MODE) {
    console.log("\n[sim] 模拟器运行中。");
    if (PAIR_MODE) {
      console.log("      配对模式：已收 MQTT 安装码并完成注册。");
    }
    console.log("      请在 Settings / 配对页或用 curl 把此 node 绑定（看到 pending 后）。");
    console.log("      绑定后会自动收到 config 并 ack。");
    console.log("      然后可以用聊天发控制指令观察完整闭环。\n");
  } else {
    console.log("[sim] 运行在测试模式 (TEST_MODE)。等待绑定和命令...");
    emit("WAITING_FOR_BIND", { node_id: NODE_ID });
  }

  // 保持进程
  const shutdown = () => {
    console.log("\n[sim] 退出");
    releaseSimulatorLock();
    client.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  releaseSimulatorLock();
  console.error("simulator crashed:", e);
  process.exit(1);
});
