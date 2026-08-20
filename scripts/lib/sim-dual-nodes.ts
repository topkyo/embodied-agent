import {
  type DeviceRegistry,
  getNodeToken,
  issueNodeToken,
  loadRegistry,
  upsertNodeInRegistry,
} from "@embodied-agent/node";
import { SIM_NODE_IDS, SIM_NODE_PRESETS, simRebindDevices } from "./sim-node-presets.js";

export function nodeNeedsBinding(registry: DeviceRegistry, node_id: string): boolean {
  const node = (registry.nodes ?? []).find((n) => n.node_id === node_id);
  if (!node || node.status !== "active") return true;
  const bound = registry.devices.filter((d) => d.node_id === node_id);
  return bound.length === 0;
}

export function upsertSimNodeRecord(node_id: string): void {
  const preset = SIM_NODE_PRESETS[node_id];
  if (!preset) throw new Error(`unknown sim node: ${node_id}`);
  const existing = (loadRegistry().nodes ?? []).find((n) => n.node_id === node_id);
  upsertNodeInRegistry({
    node_id,
    deployment_id: preset.deployment_id,
    entity_id: preset.greenhouse_id,
    firmware_version: "sim-0.3.0",
    config_version: existing?.config_version ?? 0,
    status: "active",
    registered_at: existing?.registered_at ?? new Date().toISOString(),
  });
}

export function ensureSimNodeTokens(): void {
  for (const nodeId of SIM_NODE_IDS) {
    const preset = SIM_NODE_PRESETS[nodeId];
    if (!preset) throw new Error(`unknown sim node: ${nodeId}`);
    if (!getNodeToken(preset.deployment_id, nodeId)) {
      const token = issueNodeToken(preset.deployment_id, nodeId);
      console.log(`[ensure-sim] issued token ${nodeId} ${token.slice(0, 16)}…`);
    }
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

async function rebindViaApi(opts: {
  apiBase: string;
  adminToken: string;
  node_id: string;
  maxAttempts?: number;
}): Promise<number> {
  const preset = SIM_NODE_PRESETS[opts.node_id];
  if (!preset) throw new Error(`unknown sim node: ${opts.node_id}`);
  const maxAttempts = opts.maxAttempts ?? 8;
  const bodyPayload = {
    deployment_id: preset.deployment_id,
    entity_id: preset.greenhouse_id,
    devices: simRebindDevices(opts.node_id as (typeof SIM_NODE_IDS)[number]),
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(
      `${opts.apiBase}/admin/nodes/${encodeURIComponent(opts.node_id)}/binding`,
      {
        method: "PUT",
        headers: {
          "x-admin-token": opts.adminToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
      },
    );
    if (!res.ok) {
      throw new Error(`rebind ${opts.node_id} failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as RebindApiResponse;
    const cv = body.node?.config_version ?? 0;
    if (body.config_published !== false) {
      return cv;
    }
    if (attempt < maxAttempts) {
      console.log(
        `[ensure-sim] MQTT config not published for ${opts.node_id}, retry ${attempt}/${maxAttempts}`,
      );
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  throw new Error(
    `rebind ${opts.node_id}: MQTT config publish failed after ${maxAttempts} attempts`,
  );
}

export type EnsureSimDualResult = {
  rebound: string[];
  skipped: string[];
};

export function shouldRebindNode(
  registry: DeviceRegistry,
  node_id: string,
  forceRebind: boolean,
): boolean {
  if (forceRebind) return true;
  return nodeNeedsBinding(registry, node_id);
}

export async function ensureSimDualNodes(opts?: {
  apiBase?: string;
  adminToken?: string;
  apiWaitMs?: number;
  /** aedes 重启后 retained config 丢失，须强制 MQTT 重发 */
  forceRebind?: boolean;
}): Promise<EnsureSimDualResult> {
  const apiBase = opts?.apiBase ?? process.env.API_URL ?? "http://127.0.0.1:3001";
  const adminToken = opts?.adminToken ?? process.env.ADMIN_TOKEN ?? "dev-admin";
  const apiWaitMs = opts?.apiWaitMs ?? 60_000;
  const forceRebind =
    opts?.forceRebind === true || process.env.ENSURE_SIM_DUAL_FORCE_REBIND === "1";

  ensureSimNodeTokens();

  let registry = loadRegistry();
  const needRebind: string[] = [];
  for (const nodeId of SIM_NODE_IDS) {
    if (!registry.nodes?.some((n) => n.node_id === nodeId)) {
      upsertSimNodeRecord(nodeId);
      console.log(`[ensure-sim] upserted registry node ${nodeId}`);
    }
    registry = loadRegistry();
    if (shouldRebindNode(registry, nodeId, forceRebind)) {
      needRebind.push(nodeId);
    }
  }

  if (needRebind.length === 0) {
    console.log("[ensure-sim] dual nodes OK, skip rebind");
    return { rebound: [], skipped: [...SIM_NODE_IDS] };
  }

  if (forceRebind) {
    console.log(`[ensure-sim] force rebind retained MQTT config for: ${needRebind.join(", ")}`);
  }

  await waitForApi(apiBase, apiWaitMs);

  const rebound: string[] = [];
  for (const nodeId of needRebind) {
    const cv = await rebindViaApi({ apiBase, adminToken, node_id: nodeId });
    console.log(`[ensure-sim] ::REBIND_OK:: ${nodeId} cv=${cv}`);
    rebound.push(nodeId);
  }

  const skipped = SIM_NODE_IDS.filter((id) => !rebound.includes(id));
  return { rebound, skipped };
}
