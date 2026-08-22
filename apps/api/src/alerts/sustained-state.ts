import { existsSync, mkdirSync, readFileSync } from "node:fs";
import {
  nextSustainedEpisodeTick,
  shouldEvaluateSustainedL1,
  type SustainedEpisodeSnapshot,
} from "@embodied-agent/alert-runtime";
import { createLogger } from "@embodied-agent/platform";
import { currentDeploymentId, deploymentScopedPath } from "../fs/deployment-path.js";
import { atomicWriteJson } from "@embodied-agent/platform";
import { withFileLock } from "../fs/file-lock.js";

export type SustainedEpisode = SustainedEpisodeSnapshot;

type StateFile = {
  episodes: Record<string, SustainedEpisode>;
};

const log = createLogger("sustained-state");

function statePath(deployment_id = currentDeploymentId()): string {
  return deploymentScopedPath("sustained-anomaly-state.json", deployment_id);
}

function lockPath(deployment_id = currentDeploymentId()): string {
  return deploymentScopedPath("sustained-anomaly-state.lock", deployment_id);
}

function readState(deployment_id = currentDeploymentId()): StateFile {
  const p = statePath(deployment_id);
  if (!existsSync(p)) return { episodes: {} };
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as Partial<StateFile>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.episodes ||
      typeof parsed.episodes !== "object" ||
      Array.isArray(parsed.episodes)
    ) {
      throw new Error("sustained state root must contain object episodes");
    }
    for (const [key, value] of Object.entries(parsed.episodes)) {
      if (!value || typeof value !== "object" || typeof value.streak_minutes !== "number") {
        throw new Error(`sustained episode ${key} must contain numeric streak_minutes`);
      }
    }
    return { episodes: parsed.episodes as Record<string, SustainedEpisode> };
  } catch (error) {
    log.error("sustained anomaly state invalid", {
      deployment_id,
      path: p,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function writeState(state: StateFile, deployment_id = currentDeploymentId()): void {
  const p = statePath(deployment_id);
  mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true });
  atomicWriteJson(p, state);
}

export function sustainedMinMinutes(): number {
  const n = Number.parseInt(process.env.SUSTAINED_ALERT_MINUTES ?? "15", 10);
  return Number.isFinite(n) && n > 0 ? n : 15;
}

export function isSustainedAlertsEnabled(): boolean {
  return process.env.SUSTAINED_ALERTS !== "0";
}

function l1ReservationTtlMs(): number {
  const raw = process.env.SUSTAINED_L1_RESERVATION_TTL_SECONDS;
  if (raw === undefined || raw.trim() === "") return 5 * 60 * 1000;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`SUSTAINED_L1_RESERVATION_TTL_SECONDS 无效：${raw}`);
  }
  return parsed * 1000;
}

function expireStaleL1Reservation(row: SustainedEpisode, now: Date): void {
  if (!row.l1_reserved_at) return;
  const reservedMs = Date.parse(row.l1_reserved_at);
  if (!Number.isFinite(reservedMs) || now.getTime() - reservedMs >= l1ReservationTtlMs()) {
    delete row.l1_reserved_at;
  }
}

/** 每分钟调用一次：返回更新后的 streak */
export async function tickSustainedEpisode(
  ruleKey: string,
  breaching: boolean,
  now = new Date(),
  deployment_id = currentDeploymentId(),
): Promise<SustainedEpisode> {
  return withFileLock(lockPath(deployment_id), () => {
    const state = readState(deployment_id);
    const existing = state.episodes[ruleKey];
    if (existing) {
      expireStaleL1Reservation(existing, now);
    }
    const iso = now.toISOString();
    const next = nextSustainedEpisodeTick(existing, breaching, iso);

    if (!breaching) {
      delete state.episodes[ruleKey];
      writeState(state, deployment_id);
      return next;
    }

    state.episodes[ruleKey] = next;
    writeState(state, deployment_id);
    return next;
  });
}

export async function reserveSustainedL1Send(
  ruleKey: string,
  minStreakMinutes: number,
  breaching: boolean,
  now = new Date(),
  deployment_id = currentDeploymentId(),
): Promise<SustainedEpisode | null> {
  l1ReservationTtlMs();
  return withFileLock(lockPath(deployment_id), () => {
    const state = readState(deployment_id);
    const row = state.episodes[ruleKey];
    if (!row) return null;
    expireStaleL1Reservation(row, now);
    if (!shouldEvaluateSustainedL1(row, minStreakMinutes, breaching)) {
      return null;
    }
    row.l1_reserved_at = now.toISOString();
    writeState(state, deployment_id);
    return { ...row };
  });
}

export async function confirmSustainedL1Sent(
  ruleKey: string,
  now = new Date(),
  deployment_id = currentDeploymentId(),
): Promise<SustainedEpisode | undefined> {
  return withFileLock(lockPath(deployment_id), () => {
    const state = readState(deployment_id);
    const row = state.episodes[ruleKey];
    if (!row) return undefined;
    row.l1_sent_at = now.toISOString();
    delete row.l1_reserved_at;
    writeState(state, deployment_id);
    return { ...row };
  });
}

export async function releaseSustainedL1Reservation(
  ruleKey: string,
  deployment_id = currentDeploymentId(),
): Promise<void> {
  await withFileLock(lockPath(deployment_id), () => {
    const state = readState(deployment_id);
    const row = state.episodes[ruleKey];
    if (!row) return;
    delete row.l1_reserved_at;
    writeState(state, deployment_id);
  });
}

export async function markSustainedL2Sent(
  ruleKey: string,
  now = new Date(),
  deployment_id = currentDeploymentId(),
): Promise<void> {
  await withFileLock(lockPath(deployment_id), () => {
    const state = readState(deployment_id);
    const row = state.episodes[ruleKey];
    if (!row) return;
    row.l2_sent_at = now.toISOString();
    writeState(state, deployment_id);
  });
}

/** @internal tests */
export async function clearSustainedState(deployment_id = currentDeploymentId()): Promise<void> {
  await withFileLock(lockPath(deployment_id), () => {
    writeState({ episodes: {} }, deployment_id);
  });
}

/** @internal tests */
export async function getSustainedEpisode(
  ruleKey: string,
  deployment_id = currentDeploymentId(),
): Promise<SustainedEpisode | undefined> {
  return withFileLock(lockPath(deployment_id), () => {
    const state = readState(deployment_id);
    const row = state.episodes[ruleKey];
    if (!row) return undefined;
    const hadReservation = Boolean(row.l1_reserved_at);
    expireStaleL1Reservation(row, new Date());
    if (hadReservation && !row.l1_reserved_at) {
      writeState(state, deployment_id);
    }
    return { ...row };
  });
}
