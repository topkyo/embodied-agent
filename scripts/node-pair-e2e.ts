#!/usr/bin/env tsx
/**
 * QR/MQTT 配对 e2e：模拟 ESP32 订阅 pairing topic → 收码 → 自注册 → pending
 *
 * 前置: API 运行中 (npm run api:dev)，MQTT broker 可连
 * 运行: ADMIN_TOKEN=dev-admin npx tsx scripts/node-pair-e2e.ts
 */
import { pairingInstallCodeTopic } from "@embodied-agent/platform";
import mqtt, { type MqttClient } from "mqtt";
import { setTimeout as sleep } from "node:timers/promises";

const API = process.env.API_URL ?? "http://127.0.0.1:3001";
const ADMIN = process.env.ADMIN_TOKEN ?? "dev-admin";
const MQTT_URL = process.env.MQTT_URL ?? "mqtt://127.0.0.1:1883";
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID ?? "dep-gh-pilot-001";
const GH = process.env.GREENHOUSE_ID ?? "gh-001";
const NODE_ID = process.env.NODE_ID ?? `node-pair-e2e-${Date.now().toString(36)}`;

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

async function waitForPairingCode(client: MqttClient, timeoutMs = 15000): Promise<string> {
  const topic = pairingInstallCodeTopic(DEPLOYMENT_ID, NODE_ID);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timeout waiting pairing install_code on MQTT")),
      timeoutMs,
    );
    client.subscribe(topic, (err) => {
      if (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
    client.on("message", (t, buf) => {
      if (t !== topic) return;
      clearTimeout(timer);
      const raw = JSON.parse(buf.toString());
      if (!raw.install_code) {
        reject(new Error("pairing payload missing install_code"));
        return;
      }
      console.log("::PAIRING_CODE_RECEIVED::", raw.install_code);
      resolve(raw.install_code as string);
    });
  });
}

async function main() {
  console.log("=== Node Pair E2E (MQTT delivery) ===");
  console.log("node_id:", NODE_ID, "deployment:", DEPLOYMENT_ID, "gh:", GH);

  const client = mqtt.connect(MQTT_URL);
  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("error", reject);
  });
  console.log("[e2e] MQTT connected, waiting for pairing publish...");

  const codePromise = waitForPairingCode(client);

  await sleep(300);
  const pairRes = await adminFetch(`/admin/nodes/${encodeURIComponent(NODE_ID)}/pair`, {
    method: "POST",
    body: JSON.stringify({ deployment_id: DEPLOYMENT_ID, entity_id: GH, ttl_minutes: 10 }),
  });
  console.log("::PAIR_ISSUED::", pairRes.install_code, "mqtt_published:", pairRes.mqtt_published);
  if (!pairRes.mqtt_published) {
    throw new Error("pair API did not publish to MQTT — check MQTT_URL on API");
  }

  const installCode = await codePromise;
  if (installCode !== pairRes.install_code) {
    throw new Error(`code mismatch mqtt=${installCode} api=${pairRes.install_code}`);
  }

  const regRes = await fetch(`${API}/nodes/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deployment_id: DEPLOYMENT_ID,
      install_code: installCode,
      node_id: NODE_ID,
      firmware_version: "pair-e2e-0.1",
      capabilities: {
        sensors: [{ channel: "i2c:0x44", metrics: ["temperature_c", "humidity_percent"] }],
        actuators: [
          {
            channel: "relay:vent_left",
            device_type: "vent_motor",
            actions: ["open", "close", "stop"],
          },
        ],
      },
    }),
  });
  if (!regRes.ok) {
    throw new Error(`register failed: ${regRes.status} ${await regRes.text()}`);
  }
  const reg = await regRes.json();
  console.log("::REGISTERED::", reg.status, reg.node_id);

  const pending = await adminFetch("/admin/nodes?status=pending");
  const found = (pending.nodes || []).some((n: { node_id: string }) => n.node_id === NODE_ID);
  if (!found) throw new Error("node not in pending list after register");

  console.log("=== PAIR E2E SUCCESS ===");
  client.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("PAIR E2E FAILED:", e);
  process.exit(1);
});
