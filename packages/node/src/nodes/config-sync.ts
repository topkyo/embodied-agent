import { existsSync, mkdirSync, readFileSync } from "node:fs";
import {
  atomicWriteJson,
  createLogger,
  deploymentScopedPath,
  resolveAgentDataDir as dataRoot,
} from "@embodied-agent/platform";
import type { CommandMessage } from "@embodied-agent/core";
import type { MqttCommandPublisher } from "../mqtt/client.js";
import { getNodeRuntimeBindings } from "../runtime-bindings.js";
import { getNode, upsertNodeInRegistry } from "./registry.js";
import { publishRegistryNodeConfig } from "./publish-node-config.js";

const log = createLogger("config-sync");

type AppliedSource = "heartbeat" | "config_applied" | "rejection_inferred";

type AppliedRow = {
  deployment_id: string;
  node_id: string;
  config_version: number;
  updated_at: string;
  source: AppliedSource;
};

type AppliedFile = { nodes: AppliedRow[] };

const applied = new Map<string, AppliedRow>();
const lastConfigPublishAt = new Map<string, number>();
const publishInFlight = new Set<string>();
const hydratedDeployments = new Set<string>();

export const ROUTER_CONFIG_WAIT_MS = Number(process.env.ROUTER_CONFIG_WAIT_MS ?? "800");
export const WATCHER_CONFIG_WAIT_MS = Number(process.env.WATCHER_CONFIG_WAIT_MS ?? "300");
const CONFIG_PUBLISH_COOLDOWN_MS = Number(process.env.CONFIG_PUBLISH_COOLDOWN_MS ?? "10000");

function storePath(deployment_id: string): string {
  return deploymentScopedPath(dataRoot(), deployment_id, "node-applied-config.json");
}

function appliedKey(deployment_id: string, node_id: string): string {
  return `${deployment_id}:${node_id}`;
}

function persist(deployment_id: string): void {
  const dir = deploymentScopedPath(dataRoot(), deployment_id, ".");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file: AppliedFile = {
    nodes: [...applied.values()].filter((row) => row.deployment_id === deployment_id),
  };
  atomicWriteJson(storePath(deployment_id), file);
}

function hydrate(deployment_id: string): void {
  if (hydratedDeployments.has(deployment_id)) return;
  hydratedDeployments.add(deployment_id);
  const path = storePath(deployment_id);
  if (!existsSync(path)) return;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as AppliedFile;
    const rows = raw.nodes ?? [];
    if (!Array.isArray(rows)) {
      throw new Error("nodes must be an array");
    }
    for (const row of rows) {
      if (
        row?.deployment_id === deployment_id &&
        row?.node_id &&
        typeof row.config_version === "number"
      ) {
        applied.set(appliedKey(row.deployment_id, row.node_id), row);
      }
    }
  } catch (e) {
    throw new Error(`${path} 无法读取或校验失败：${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}

export function getNodeAppliedConfigVersion(
  deployment_id: string,
  node_id: string,
): number | undefined {
  hydrate(deployment_id);
  return applied.get(appliedKey(deployment_id, node_id))?.config_version;
}

export function recordNodeAppliedConfigVersion(
  deployment_id: string,
  node_id: string,
  config_version: number,
  source: AppliedSource,
): void {
  hydrate(deployment_id);
  if (!Number.isFinite(config_version) || config_version < 0) return;
  const key = appliedKey(deployment_id, node_id);
  const prev = applied.get(key);
  if (prev?.config_version === config_version && prev?.source === source) {
    return;
  }
  applied.set(key, {
    deployment_id,
    node_id,
    config_version,
    updated_at: new Date().toISOString(),
    source,
  });
  persist(deployment_id);
  if (source === "config_applied") {
    syncRegistryConfigVersionIfBehind(deployment_id, node_id, config_version);
  }
}

function syncRegistryConfigVersionIfBehind(
  deployment_id: string,
  node_id: string,
  appliedCv: number,
): void {
  const node = getNode(deployment_id, node_id);
  if (!node) return;
  const registryCv = node.config_version ?? 0;
  if (appliedCv > registryCv) {
    log.warn(
      `registry cv ${registryCv} behind node ${node_id} applied ${appliedCv}, bumping registry`,
    );
    upsertNodeInRegistry({ ...node, config_version: appliedCv });
  }
}

function effectiveAppliedConfigVersion(deployment_id: string, node_id: string): number | undefined {
  const telemetry = getNodeRuntimeBindings();
  return (
    getNodeAppliedConfigVersion(deployment_id, node_id) ??
    telemetry.getNodeHeartbeatConfigVersion(node_id)
  );
}

export function registryConfigVersion(deployment_id: string, node_id: string): number | undefined {
  const node = getNode(deployment_id, node_id);
  if (!node) return undefined;
  const cv = node.config_version ?? 0;
  return cv > 0 ? cv : undefined;
}

function shouldRepublishConfig(deployment_id: string, node_id: string): boolean {
  const last = lastConfigPublishAt.get(appliedKey(deployment_id, node_id)) ?? 0;
  return Date.now() - last >= CONFIG_PUBLISH_COOLDOWN_MS;
}

function markConfigPublished(deployment_id: string, node_id: string): void {
  lastConfigPublishAt.set(appliedKey(deployment_id, node_id), Date.now());
}

/** @internal tests */
export function clearConfigPublishCooldownForTests(): void {
  lastConfigPublishAt.clear();
  publishInFlight.clear();
}

export function formatConfigVersionMismatchDetail(message?: string, code?: string): string {
  if (code !== "config_version_mismatch") return message ?? "配置版本不一致";
  const m = message?.match(/expected\s+(\d+)/i);
  if (m) return `节点当前配置版本为 ${m[1]}，与云端不一致`;
  return "节点配置版本与云端不一致";
}

export function configVersionMismatchHint(code?: string): string {
  return code === "config_version_mismatch"
    ? "请在配置台重新绑定节点或递增 config 版本后重试。"
    : "";
}

export function formatCommandRejectionDetail(
  error?: { code?: string; message?: string },
  fallback = "执行失败",
): string {
  const detail = formatConfigVersionMismatchDetail(error?.message ?? fallback, error?.code);
  const hint = configVersionMismatchHint(error?.code);
  return `${detail}${hint ? ` ${hint}` : ""}`;
}

export type EnsureNodeConfigResult =
  | { ok: true; config_version: number }
  | {
      ok: false;
      code: "node_not_found" | "config_not_ready" | "mqtt_publish_failed";
      message: string;
    };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function ensureNodeConfigReady(opts: {
  node_id: string;
  deployment_id: string;
  mqtt: MqttCommandPublisher;
  waitMs?: number;
}): Promise<EnsureNodeConfigResult> {
  const registryCv = registryConfigVersion(opts.deployment_id, opts.node_id);
  if (registryCv === undefined) {
    return {
      ok: false,
      code: "node_not_found",
      message: "目标节点未注册或未设置配置版本，请在配置台绑定节点。",
    };
  }

  const appliedCv = effectiveAppliedConfigVersion(opts.deployment_id, opts.node_id);
  if (appliedCv === registryCv) {
    return { ok: true, config_version: registryCv };
  }

  if (
    shouldRepublishConfig(opts.deployment_id, opts.node_id) &&
    !publishInFlight.has(appliedKey(opts.deployment_id, opts.node_id))
  ) {
    publishInFlight.add(appliedKey(opts.deployment_id, opts.node_id));
    try {
      const published = await publishRegistryNodeConfig(
        opts.mqtt,
        opts.node_id,
        opts.deployment_id,
      );
      if (!published.ok) {
        return {
          ok: false,
          code: "mqtt_publish_failed",
          message: "节点配置下发失败，请检查 MQTT 连接后重试。",
        };
      }
      markConfigPublished(opts.deployment_id, opts.node_id);
    } finally {
      publishInFlight.delete(appliedKey(opts.deployment_id, opts.node_id));
    }
  }

  const waitMs = opts.waitMs ?? ROUTER_CONFIG_WAIT_MS;
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const nowApplied = effectiveAppliedConfigVersion(opts.deployment_id, opts.node_id);
    if (nowApplied === registryCv) {
      return { ok: true, config_version: registryCv };
    }
    await sleep(150);
  }

  const heartbeat = getNodeRuntimeBindings().getNodeHeartbeat(opts.node_id);
  if (!heartbeat) {
    return {
      ok: false,
      code: "config_not_ready",
      message: "节点配置尚未同步（节点可能离线或未应用最新配置），请在配置台重新绑定节点后重试。",
    };
  }

  return {
    ok: false,
    code: "config_not_ready",
    message: "节点配置版本尚未对齐，已在后台重发配置，请等待数秒后重试或于配置台重新绑定节点。",
  };
}

export type PrepareCommandResult =
  | { ok: true; command: CommandMessage; config_version: number }
  | Extract<EnsureNodeConfigResult, { ok: false }>;

export async function prepareCommandForPublish(
  cmd: CommandMessage,
  mqtt: MqttCommandPublisher,
  opts?: { waitMs?: number },
): Promise<PrepareCommandResult> {
  const ensured = await ensureNodeConfigReady({
    node_id: cmd.node_id,
    deployment_id: cmd.deployment_id,
    mqtt,
    waitMs: opts?.waitMs,
  });
  if (!ensured.ok) return ensured;
  return {
    ok: true,
    config_version: ensured.config_version,
    command: { ...cmd, config_version: ensured.config_version },
  };
}

export async function republishNodeConfigOnMismatch(
  event: {
    node_id: string;
    deployment_id: string;
    error?: { code?: string; message?: string };
  },
  mqtt?: MqttCommandPublisher,
): Promise<void> {
  if (event.error?.code !== "config_version_mismatch") return;
  const m = event.error.message?.match(/expected\s+(\d+)/i);
  if (m) {
    recordNodeAppliedConfigVersion(
      event.deployment_id,
      event.node_id,
      Number.parseInt(m[1]!, 10),
      "rejection_inferred",
    );
  }
  if (!mqtt || !shouldRepublishConfig(event.deployment_id, event.node_id)) return;
  const published = await publishRegistryNodeConfig(mqtt, event.node_id, event.deployment_id);
  if (published.ok) markConfigPublished(event.deployment_id, event.node_id);
}

/** @internal tests */
export function clearNodeAppliedConfigForTests(deployment_id: string): void {
  applied.clear();
  lastConfigPublishAt.clear();
  hydratedDeployments.clear();
  hydratedDeployments.add(deployment_id);
  const path = storePath(deployment_id);
  if (existsSync(path)) atomicWriteJson(path, { nodes: [] });
}

/** @internal tests — round-trip hydrate after persist */
export function reloadNodeAppliedConfigForTests(deployment_id: string): void {
  applied.clear();
  hydratedDeployments.delete(deployment_id);
  hydrate(deployment_id);
}
