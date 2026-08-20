#!/usr/bin/env tsx
/**
 * industrial 常驻模拟器启动前：补齐 registry 节点、token，必要时 rebind 并 MQTT 下发 config。
 *
 * 用法：
 *   AGENT_DATA_DIR=.agentstack/dev-profiles/industrial/data npx tsx scripts/ensure-sim-industrial.ts
 *   npm run ensure:sim-industrial
 */
import {
  getNodeToken,
  issueNodeToken,
  loadRegistry,
  upsertNodeInRegistry,
} from "@embodied-agent/node";
import { nodeNeedsBinding } from "./lib/sim-dual-nodes.js";

const NODE_ID = "node-sim-industrial-001";
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID?.trim() || "dep-industrial-ci-001";
const CABINET_ID = "cabinet-001";

const INDUSTRIAL_REBIND_DEVICES = [
  {
    device_id: "sensor-industrial-001",
    device_type: "sensor",
    name: "柜内温度",
    channel: "i2c:0x48",
    metrics: ["temperature_c"],
  },
  {
    device_id: "fan-industrial-001",
    device_type: "fan",
    name: "排风风机",
    channel: "relay:exhaust",
    default_for: "exhaust_fan",
  },
] as const;

function upsertIndustrialSimNodeRecord(): void {
  const existing = (loadRegistry().nodes ?? []).find((n) => n.node_id === NODE_ID);
  upsertNodeInRegistry({
    node_id: NODE_ID,
    deployment_id: DEPLOYMENT_ID,
    entity_id: CABINET_ID,
    firmware_version: "sim-0.3.0",
    config_version: existing?.config_version ?? 0,
    status: "active",
    registered_at: existing?.registered_at ?? new Date().toISOString(),
  });
}

function ensureIndustrialNodeToken(): void {
  if (!getNodeToken(DEPLOYMENT_ID, NODE_ID)) {
    const token = issueNodeToken(DEPLOYMENT_ID, NODE_ID);
    console.log(`[ensure-sim-industrial] issued token ${NODE_ID} ${token.slice(0, 16)}…`);
  }
}

async function waitForApi(apiBase: string, maxMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${apiBase}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`API 未就绪：${apiBase}/health（等待 ${maxMs}ms）`);
}

type RebindApiResponse = {
  node?: { config_version?: number };
  config_published?: boolean;
};

async function rebindIndustrialNode(opts: {
  apiBase: string;
  adminToken: string;
  maxAttempts?: number;
}): Promise<number> {
  const maxAttempts = opts.maxAttempts ?? 8;
  const bodyPayload = {
    deployment_id: DEPLOYMENT_ID,
    entity_id: CABINET_ID,
    devices: [...INDUSTRIAL_REBIND_DEVICES],
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${opts.apiBase}/admin/nodes/${encodeURIComponent(NODE_ID)}/binding`, {
      method: "PUT",
      headers: {
        "x-admin-token": opts.adminToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyPayload),
    });
    if (!res.ok) {
      throw new Error(`rebind ${NODE_ID} failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as RebindApiResponse;
    const cv = body.node?.config_version ?? 0;
    if (body.config_published !== false) {
      return cv;
    }
    if (attempt < maxAttempts) {
      console.log(
        `[ensure-sim-industrial] MQTT config not published for ${NODE_ID}, retry ${attempt}/${maxAttempts}`,
      );
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  throw new Error(`rebind ${NODE_ID}: MQTT config publish failed after ${maxAttempts} attempts`);
}

export type EnsureSimIndustrialResult = {
  rebound: boolean;
  skipped: boolean;
};

export async function ensureSimIndustrial(opts?: {
  apiBase?: string;
  adminToken?: string;
  apiWaitMs?: number;
  forceRebind?: boolean;
}): Promise<EnsureSimIndustrialResult> {
  const apiBase = opts?.apiBase ?? process.env.API_URL ?? "http://127.0.0.1:3001";
  const adminToken = opts?.adminToken ?? process.env.ADMIN_TOKEN ?? "dev-admin";
  const apiWaitMs = opts?.apiWaitMs ?? 60_000;
  const forceRebind =
    opts?.forceRebind === true || process.env.ENSURE_SIM_INDUSTRIAL_FORCE_REBIND === "1";

  ensureIndustrialNodeToken();

  let registry = loadRegistry();
  if (!registry.nodes?.some((n) => n.node_id === NODE_ID)) {
    upsertIndustrialSimNodeRecord();
    console.log(`[ensure-sim-industrial] upserted registry node ${NODE_ID}`);
    registry = loadRegistry();
  }

  const needsRebind = forceRebind || nodeNeedsBinding(registry, NODE_ID);
  if (!needsRebind) {
    console.log("[ensure-sim-industrial] node OK, skip rebind");
    return { rebound: false, skipped: true };
  }

  if (forceRebind) {
    console.log(`[ensure-sim-industrial] force rebind retained MQTT config for ${NODE_ID}`);
  }

  await waitForApi(apiBase, apiWaitMs);
  const cv = await rebindIndustrialNode({ apiBase, adminToken });
  console.log(`[ensure-sim-industrial] ::REBIND_OK:: ${NODE_ID} cv=${cv}`);
  return { rebound: true, skipped: false };
}

async function main() {
  const result = await ensureSimIndustrial();
  console.log(`[ensure-sim-industrial] done rebound=${result.rebound} skipped=${result.skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
