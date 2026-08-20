import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export type DevChatResult = {
  status: number;
  reply: string;
  body: Record<string, unknown>;
};

export type PendingConfirmRow = {
  user_id: string;
  conversation_id: string;
  intent?: { skill?: string };
  scene_skill_id?: string;
  created_at?: number;
};

export async function devChat(opts: {
  api: string;
  text: string;
  userId: string;
  conversationId: string;
  timeoutMs?: number;
}): Promise<DevChatResult> {
  const res = await fetch(`${opts.api}/dev/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: opts.text,
      user_id: opts.userId,
      conversation_id: opts.conversationId,
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
  });
  const body = (await res.json()) as Record<string, unknown>;
  return {
    status: res.status,
    reply: String(body.reply ?? ""),
    body,
  };
}

export function readPendingConfirm(deploymentDir: string): PendingConfirmRow[] {
  const path = resolve(deploymentDir, "pending-confirm.json");
  if (!existsSync(path)) return [];
  try {
    const rows = JSON.parse(readFileSync(path, "utf8")) as PendingConfirmRow[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function waitForPendingConfirm(opts: {
  deploymentDir: string;
  userId: string;
  timeoutMs: number;
  pollMs?: number;
}): Promise<PendingConfirmRow> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const hit = readPendingConfirm(opts.deploymentDir).find((r) => r.user_id === opts.userId);
    if (hit) return hit;
    await sleep(opts.pollMs ?? 5000);
  }
  throw new Error(`超时：${opts.timeoutMs}ms 内未出现 pending-confirm（user=${opts.userId}）`);
}

export function readCompletedVentCommands(
  deploymentDir: string,
  deploymentId: string,
  greenhouseId: string,
  sinceMs: number,
): number {
  const path = resolve(deploymentDir, "deployments", deploymentId, "command-logs.jsonl");
  if (!existsSync(path)) return 0;
  const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  let count = 0;
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as {
        status?: string;
        updated_at?: string;
        scene_skill_id?: string;
        command?: {
          device_id?: string;
          greenhouse_id?: string;
          device_type?: string;
          action?: string;
        };
      };
      if (row.status !== "completed") continue;
      const ts = row.updated_at ? Date.parse(row.updated_at) : 0;
      if (ts < sinceMs) continue;
      const deviceId = row.command?.device_id ?? "";
      if (!deviceId.includes(greenhouseId)) continue;
      if (row.command?.device_type === "vent_motor" || row.command?.device_type === "fan") {
        count++;
      }
    } catch {
      /* skip bad line */
    }
  }
  return count;
}

export function readCompletedIrrigationCommands(
  deploymentDir: string,
  deploymentId: string,
  greenhouseId: string,
  sinceMs: number,
): number {
  const path = resolve(deploymentDir, "deployments", deploymentId, "command-logs.jsonl");
  if (!existsSync(path)) return 0;
  let count = 0;
  for (const line of readFileSync(path, "utf8").trim().split("\n")) {
    if (!line) continue;
    try {
      const row = JSON.parse(line) as {
        status?: string;
        updated_at?: string;
        command?: { device_id?: string; device_type?: string; action?: string };
      };
      if (row.status !== "completed") continue;
      const ts = row.updated_at ? Date.parse(row.updated_at) : 0;
      if (ts < sinceMs) continue;
      const deviceId = row.command?.device_id ?? "";
      if (!deviceId.includes(greenhouseId)) continue;
      if (row.command?.device_type === "irrigation_valve" && row.command?.action === "start") {
        count++;
      }
    } catch {
      /* skip bad line */
    }
  }
  return count;
}

export async function waitForIrrigationCompleted(opts: {
  deploymentDir: string;
  deploymentId: string;
  greenhouseId: string;
  sinceMs: number;
  timeoutMs: number;
  pollMs?: number;
}): Promise<void> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    if (
      readCompletedIrrigationCommands(
        opts.deploymentDir,
        opts.deploymentId,
        opts.greenhouseId,
        opts.sinceMs,
      ) > 0
    ) {
      return;
    }
    await sleep(opts.pollMs ?? 5000);
  }
  throw new Error(`超时：${opts.timeoutMs}ms 内未见 ${opts.greenhouseId} 灌溉 completed`);
}

export async function preflightFlywheelDev(
  api: string,
  opts?: { waitReadyMs?: number },
): Promise<void> {
  const deadline = Date.now() + (opts?.waitReadyMs ?? 120_000);
  let last: { ready?: boolean; flywheel_dev?: boolean } = {};
  while (Date.now() < deadline) {
    const res = await fetch(`${api}/dev/flywheel/ready`);
    if (!res.ok) throw new Error(`flywheel ready ${res.status}`);
    last = (await res.json()) as typeof last;
    if (!last.flywheel_dev) {
      throw new Error("API 未启用 FLYWHEEL_DEV=1（attach 模式须重启 API 并带 FLYWHEEL_DEV=1）");
    }
    if (last.ready) return;
    await sleep(3000);
  }
  throw new Error(`双棚飞轮未就绪（ready=false status=${JSON.stringify(last)}）`);
}

export function isAmbiguousConfirmReply(reply: string): boolean {
  return reply.includes("多个待确认") || reply.includes("当前没有待确认的操作");
}

export async function confirmPendingWithRetry(opts: {
  api: string;
  userId: string;
  conversationId: string;
  maxAttempts?: number;
  retryMs?: number;
}): Promise<DevChatResult> {
  const attempts = opts.maxAttempts ?? 5;
  let last: DevChatResult = { status: 0, reply: "", body: {} };
  for (let i = 0; i < attempts; i++) {
    last = await confirmPending({
      api: opts.api,
      userId: opts.userId,
      conversationId: opts.conversationId,
    });
    if (last.status === 200) {
      if (isAmbiguousConfirmReply(last.reply)) {
        await sleep(opts.retryMs ?? 5000);
        continue;
      }
      return last;
    }
    if (last.status === 503 && (last.reply.includes("配置") || last.reply.includes("节点"))) {
      await sleep(opts.retryMs ?? 5000);
      continue;
    }
    return last;
  }
  if (last.status === 200 && isAmbiguousConfirmReply(last.reply)) {
    return { ...last, status: 409 };
  }
  return last;
}

export async function waitForCommandCompleted(opts: {
  deploymentDir: string;
  deploymentId: string;
  greenhouseId: string;
  sinceMs: number;
  timeoutMs: number;
  pollMs?: number;
}): Promise<void> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    if (
      readCompletedVentCommands(
        opts.deploymentDir,
        opts.deploymentId,
        opts.greenhouseId,
        opts.sinceMs,
      ) > 0
    ) {
      return;
    }
    await sleep(opts.pollMs ?? 5000);
  }
  throw new Error(`超时：${opts.timeoutMs}ms 内未见 ${opts.greenhouseId} 通风/风机 completed`);
}

// 与 apps/api/src/commands/types.ts IN_FLIGHT_COMMAND_STATUSES 保持同步；
// e2e 侧用 string 版本避免跨包类型依赖。
const IN_FLIGHT_STATUSES = new Set(["created", "sent", "acknowledged", "running"]);

/**
 * 等待 device 无 in-flight 命令（status ∈ {created,sent,acknowledged,running}）。
 * 用于 e2e 步骤间确保设备空闲，避免 in-flight 去重拦截后续命令。
 */
export async function waitForDeviceIdle(opts: {
  deploymentDir: string;
  deploymentId: string;
  deviceId: string;
  timeoutMs: number;
  pollMs?: number;
}): Promise<void> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    if (!hasInFlightCommand(opts.deploymentDir, opts.deploymentId, opts.deviceId)) {
      return;
    }
    await sleep(opts.pollMs ?? 5000);
  }
  throw new Error(`超时：${opts.deviceId} 仍有 in-flight 命令（${opts.timeoutMs}ms）`);
}

function hasInFlightCommand(
  deploymentDir: string,
  deploymentId: string,
  deviceId: string,
): boolean {
  const path = resolve(deploymentDir, "deployments", deploymentId, "command-logs.jsonl");
  if (!existsSync(path)) return false;
  const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  let latestStatus: string | undefined;
  let latestTs = 0;
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as {
        status?: string;
        updated_at?: string;
        command?: { device_id?: string };
      };
      if (row.command?.device_id !== deviceId) continue;
      const ts = row.updated_at ? Date.parse(row.updated_at) : 0;
      if (ts >= latestTs) {
        latestTs = ts;
        latestStatus = row.status;
      }
    } catch {
      /* skip bad line */
    }
  }
  return latestStatus ? IN_FLIGHT_STATUSES.has(latestStatus) : false;
}

export async function getOutcomeCount(api: string, token: string): Promise<number> {
  const res = await fetch(`${api}/admin/scene-outcomes`, {
    headers: { "x-admin-token": token },
  });
  if (!res.ok) throw new Error(`scene-outcomes ${res.status}`);
  const body = (await res.json()) as { outcomes?: unknown[] };
  return body.outcomes?.length ?? 0;
}

export async function pollOutcomeCount(opts: {
  api: string;
  token: string;
  minCount: number;
  timeoutMs: number;
  pollMs?: number;
}): Promise<number> {
  const deadline = Date.now() + opts.timeoutMs;
  let last = 0;
  while (Date.now() < deadline) {
    const res = await fetch(`${opts.api}/admin/scene-outcomes`, {
      headers: { "x-admin-token": opts.token },
    });
    if (!res.ok) throw new Error(`scene-outcomes ${res.status}`);
    const body = (await res.json()) as { outcomes?: unknown[] };
    last = body.outcomes?.length ?? 0;
    if (last >= opts.minCount) return last;
    await sleep(opts.pollMs ?? 10_000);
  }
  throw new Error(`超时：outcomes ${last} < ${opts.minCount}（等待 ${opts.timeoutMs}ms）`);
}

export async function fetchRoiSummary(opts: { api: string; token: string }): Promise<string> {
  const res = await fetch(`${opts.api}/admin/pilot/roi?since_days=7`, {
    headers: { "x-admin-token": opts.token },
  });
  if (!res.ok) throw new Error(`pilot/roi ${res.status}`);
  const body = (await res.json()) as { summary_text?: string };
  const text = body.summary_text?.trim() ?? "";
  if (!text) throw new Error("pilot/roi summary_text 为空");
  return text;
}

export async function postResetFlywheelState(api: string): Promise<void> {
  const res = await fetch(`${api}/dev/flywheel/reset-state`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`reset-state ${res.status}: ${body}`);
  }
}

/** sustained 可能重复推送已执行场景的 pending；确认下一场景前清理旧条目。 */
export async function clearScenePending(opts: {
  api: string;
  userId: string;
  conversationId: string;
  sceneSkillId: string;
}): Promise<void> {
  const res = await fetch(`${opts.api}/dev/flywheel/clear-pending`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: opts.userId,
      conversation_id: opts.conversationId,
      scene_skill_id: opts.sceneSkillId,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`clear-pending ${res.status}: ${body}`);
  }
}

export async function apiHealth(api: string): Promise<void> {
  const res = await fetch(`${api}/health`);
  if (!res.ok) throw new Error(`API health ${res.status}`);
}

/** 对齐飞轮农场用户 deployment_id，并刷新 API 内存缓存（灌后通风等 digest 收件人）。 */
export async function ensureFlywheelPilotUsers(opts: {
  api: string;
  token: string;
  deploymentId?: string;
}): Promise<void> {
  const deploymentId = opts.deploymentId ?? "dep-gh-pilot-001";
  for (const userId of ["owner-001", "worker-001"] as const) {
    const res = await fetch(`${opts.api}/admin/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      headers: {
        "x-admin-token": opts.token,
        "content-type": "application/json",
      },
      body: JSON.stringify({ deployment_id: deploymentId }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ensure pilot user ${userId} ${res.status}: ${body}`);
    }
  }
}

export async function postPilotBaseline(opts: { api: string; token: string }): Promise<void> {
  const res = await fetch(`${opts.api}/admin/pilot/baseline`, {
    method: "POST",
    headers: {
      "x-admin-token": opts.token,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      manual_run_shed_count_per_week: 14,
      notes: "双棚飞轮联调基线",
    }),
  });
  if (!res.ok) throw new Error(`pilot/baseline ${res.status}`);
}

export async function getSceneOutcomeIds(api: string, token: string): Promise<string[]> {
  const res = await fetch(`${api}/admin/scene-outcomes`, {
    headers: { "x-admin-token": token },
  });
  if (!res.ok) throw new Error(`scene-outcomes ${res.status}`);
  const body = (await res.json()) as {
    outcomes?: { scene_skill_id?: string }[];
  };
  return (body.outcomes ?? [])
    .map((o) => o.scene_skill_id)
    .filter((id): id is string => Boolean(id));
}

export async function tickSustainedAlerts(api: string): Promise<void> {
  const res = await fetch(`${api}/dev/flywheel/tick-sustained`, {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`tick-sustained ${res.status}: ${body}`);
  }
}

async function fetchPendingFromApi(api: string, userId: string): Promise<PendingConfirmRow[]> {
  const res = await fetch(`${api}/dev/flywheel/pending?user_id=${encodeURIComponent(userId)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`pending ${res.status}: ${body}`);
  }
  const body = (await res.json()) as { rows?: PendingConfirmRow[] };
  return body.rows ?? [];
}

export async function waitForPendingScene(opts: {
  deploymentDir: string;
  userId: string;
  sceneSkillId?: string;
  sinceMs?: number;
  timeoutMs: number;
  pollMs?: number;
  api?: string;
}): Promise<PendingConfirmRow> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    if (opts.api) {
      await tickSustainedAlerts(opts.api);
    }
    const rows = (
      opts.api
        ? await fetchPendingFromApi(opts.api, opts.userId)
        : readPendingConfirm(opts.deploymentDir)
    ).filter((r) => {
      if (r.user_id !== opts.userId) return false;
      if (opts.sinceMs !== undefined) {
        const created = r.created_at ?? 0;
        if (created < opts.sinceMs) return false;
      }
      return true;
    });
    const sceneRows = opts.sceneSkillId
      ? rows.filter((r) => r.scene_skill_id === opts.sceneSkillId)
      : rows;
    const hit = sceneRows.find((r) => r.conversation_id === "wx-flywheel-dev") ?? sceneRows[0];
    if (hit) return hit;
    await sleep(opts.pollMs ?? 8000);
  }
  throw new Error(`超时：未出现 pending scene=${opts.sceneSkillId ?? "*"} user=${opts.userId}`);
}

export async function confirmPending(opts: {
  api: string;
  userId: string;
  conversationId: string;
}): Promise<DevChatResult> {
  return devChat({
    api: opts.api,
    text: "确认",
    userId: opts.userId,
    conversationId: opts.conversationId,
  });
}

export async function waitForGreenhouseHumidity(opts: {
  api: string;
  token: string;
  greenhouseId: string;
  minPercent: number;
  timeoutMs: number;
  pollMs?: number;
}): Promise<number> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${opts.api}/admin/overview`, {
      headers: { "x-admin-token": opts.token },
    });
    if (res.ok) {
      const body = (await res.json()) as {
        greenhouses?: { greenhouse_id: string; humidity_percent?: number }[];
        entities?: {
          entity_id: string;
          telemetry?: { humidity_percent?: number };
        }[];
      };
      const entity = body.entities?.find((e) => e.entity_id === opts.greenhouseId);
      const greenhouse = body.greenhouses?.find((g) => g.greenhouse_id === opts.greenhouseId);
      const h = entity?.telemetry?.humidity_percent ?? greenhouse?.humidity_percent;
      if (typeof h === "number" && h >= opts.minPercent) return h;
    }
    await sleep(opts.pollMs ?? 10_000);
  }
  throw new Error(`超时：${opts.greenhouseId} 湿度未达 ${opts.minPercent}%（晨间降露简报）`);
}

export async function fetchDigestPreview(
  api: string,
  slot: "morning" | "evening" = "morning",
): Promise<string> {
  const res = await fetch(`${api}/dev/flywheel/digest-preview?slot=${slot}`);
  if (!res.ok) throw new Error(`digest-preview ${res.status}`);
  const body = (await res.json()) as { text?: string };
  return body.text ?? "";
}

export async function postWeatherProactive(
  api: string,
  body: { force_cold?: boolean; force_heat?: boolean },
): Promise<void> {
  const res = await fetch(`${api}/dev/flywheel/weather-proactive`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`weather-proactive ${res.status}`);
}

export async function setDeviceManualOverride(opts: {
  api: string;
  token: string;
  deviceId: string;
  manualOverride: boolean;
}): Promise<void> {
  const regRes = await fetch(`${opts.api}/admin/registry`, {
    headers: { "x-admin-token": opts.token },
  });
  if (!regRes.ok) throw new Error(`registry get ${regRes.status}`);
  const reg = (await regRes.json()) as {
    devices?: { device_id: string; manual_override?: boolean }[];
  };
  const devices = (reg.devices ?? []).map((d) =>
    d.device_id === opts.deviceId ? { ...d, manual_override: opts.manualOverride } : d,
  );
  const putRes = await fetch(`${opts.api}/admin/registry`, {
    method: "PUT",
    headers: {
      "x-admin-token": opts.token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...reg, devices }),
  });
  if (!putRes.ok) throw new Error(`registry put ${putRes.status}`);
}

export function readOperationLogSceneIds(
  deploymentDir: string,
  deploymentId: string,
  sinceMs: number,
): string[] {
  const path = resolve(deploymentDir, "deployments", deploymentId, "operation-logs.jsonl");
  if (!existsSync(path)) return [];
  const ids: string[] = [];
  for (const line of readFileSync(path, "utf8").trim().split("\n")) {
    if (!line) continue;
    try {
      const row = JSON.parse(line) as {
        ts?: string;
        params?: { scene_skill_id?: string };
      };
      const ts = row.ts ? Date.parse(row.ts) : 0;
      if (ts < sinceMs) continue;
      const id = row.params?.scene_skill_id;
      if (id) ids.push(id);
    } catch {
      /* skip */
    }
  }
  return ids;
}

export async function waitForOperationLogScene(opts: {
  deploymentDir: string;
  deploymentId: string;
  sceneSkillId: string;
  sinceMs: number;
  timeoutMs: number;
  pollMs?: number;
}): Promise<void> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const ids = readOperationLogSceneIds(opts.deploymentDir, opts.deploymentId, opts.sinceMs);
    if (ids.includes(opts.sceneSkillId)) return;
    await sleep(opts.pollMs ?? 5000);
  }
  throw new Error(
    `超时：operation-logs 未出现 scene=${opts.sceneSkillId}（等待 ${opts.timeoutMs}ms）`,
  );
}

export function countFailedCommands(
  deploymentDir: string,
  deploymentId: string,
  deviceId: string,
  sinceMs: number,
): number {
  const path = resolve(deploymentDir, "deployments", deploymentId, "command-logs.jsonl");
  if (!existsSync(path)) return 0;
  let n = 0;
  for (const line of readFileSync(path, "utf8").trim().split("\n")) {
    if (!line) continue;
    try {
      const row = JSON.parse(line) as {
        status?: string;
        updated_at?: string;
        command?: { device_id?: string };
      };
      if (row.status !== "failed") continue;
      if (row.command?.device_id !== deviceId) continue;
      const ts = row.updated_at ? Date.parse(row.updated_at) : 0;
      if (ts >= sinceMs) n++;
    } catch {
      /* skip */
    }
  }
  return n;
}

export async function waitForFailedCommands(opts: {
  deploymentDir: string;
  deploymentId: string;
  deviceId: string;
  sinceMs: number;
  minCount: number;
  timeoutMs: number;
}): Promise<void> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    if (
      countFailedCommands(opts.deploymentDir, opts.deploymentId, opts.deviceId, opts.sinceMs) >=
      opts.minCount
    ) {
      return;
    }
    await sleep(3000);
  }
  throw new Error(`超时：${opts.deviceId} failed 指令 < ${opts.minCount}`);
}
