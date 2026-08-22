import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createLogger } from "@embodied-agent/platform";
import { currentDeploymentId, deploymentScopedPath } from "../fs/deployment-path.js";
import { atomicWriteJson } from "@embodied-agent/platform";
import { FileLockBusyError, withFileLock } from "../fs/file-lock.js";

type CooldownFile = {
  last_fired: Record<string, string>;
  pending_reservations?: Record<string, string>;
};

const log = createLogger("alert-state");

function path(deployment_id = currentDeploymentId()): string {
  return deploymentScopedPath("alert-cooldown.json", deployment_id);
}

function lockPath(deployment_id = currentDeploymentId()): string {
  return deploymentScopedPath("alert-cooldown.lock", deployment_id);
}

function reservationTtlMs(): number {
  const raw = process.env.ALERT_COOLDOWN_RESERVATION_TTL_SECONDS;
  if (raw === undefined || raw.trim() === "") return 5 * 60 * 1000;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`ALERT_COOLDOWN_RESERVATION_TTL_SECONDS 无效：${raw}`);
  }
  return parsed * 1000;
}

function readState(deployment_id = currentDeploymentId()): CooldownFile {
  const p = path(deployment_id);
  if (!existsSync(p)) return { last_fired: {} };
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as Partial<CooldownFile>;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !parsed.last_fired ||
      typeof parsed.last_fired !== "object" ||
      Array.isArray(parsed.last_fired)
    ) {
      throw new Error("alert cooldown root must contain object last_fired");
    }
    for (const [key, value] of Object.entries(parsed.last_fired)) {
      if (typeof value !== "string") {
        throw new Error(`alert cooldown last_fired.${key} must be a string`);
      }
    }
    const pending = parsed.pending_reservations;
    if (pending !== undefined) {
      if (typeof pending !== "object" || Array.isArray(pending)) {
        throw new Error("alert cooldown pending_reservations must be an object");
      }
      for (const [key, value] of Object.entries(pending)) {
        if (typeof value !== "string") {
          throw new Error(`alert cooldown pending_reservations.${key} must be a string`);
        }
      }
    }
    return {
      last_fired: parsed.last_fired as Record<string, string>,
      ...(pending ? { pending_reservations: pending as Record<string, string> } : {}),
    };
  } catch (error) {
    log.error("alert cooldown state invalid", {
      deployment_id,
      path: p,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function writeState(state: CooldownFile, deployment_id = currentDeploymentId()): void {
  const p = path(deployment_id);
  mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true });
  atomicWriteJson(p, state);
}

function expireStaleReservations(state: CooldownFile, nowMs: number): void {
  const pending = state.pending_reservations;
  if (!pending) return;
  for (const [key, reservedAt] of Object.entries(pending)) {
    const reservedMs = Date.parse(reservedAt);
    if (!Number.isFinite(reservedMs) || nowMs - reservedMs >= reservationTtlMs()) {
      delete pending[key];
    }
  }
  if (Object.keys(pending).length === 0) {
    delete state.pending_reservations;
  }
}

function cooldownElapsed(
  last: string | undefined,
  cooldownSeconds: number,
  nowMs: number,
): boolean {
  if (!last) return true;
  const lastMs = Date.parse(last);
  if (!Number.isFinite(lastMs)) return true;
  const elapsed = nowMs - lastMs;
  return elapsed >= cooldownSeconds * 1000;
}

const COOLDOWN_LOCK_ATTEMPTS = 4;
const COOLDOWN_LOCK_RETRY_MS = 25;
const CONFIRM_RETRY_DELAYS_MS = [0, 50, 100, 200, 400, 800];

async function withAlertCooldownLock<T>(
  deployment_id: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < COOLDOWN_LOCK_ATTEMPTS; attempt++) {
    try {
      return await withFileLock(lockPath(deployment_id), fn);
    } catch (error) {
      lastError = error;
      if (!(error instanceof FileLockBusyError) || attempt === COOLDOWN_LOCK_ATTEMPTS - 1) {
        if (error instanceof FileLockBusyError) {
          log.warn("alert cooldown lock busy", {
            deployment_id,
            attempts: attempt + 1,
          });
        }
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, COOLDOWN_LOCK_RETRY_MS * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function reserveAlertCooldown(
  key: string,
  cooldownSeconds: number,
  now = Date.now(),
  deployment_id = currentDeploymentId(),
): Promise<boolean> {
  reservationTtlMs();
  return withAlertCooldownLock(deployment_id, () => {
    const state = readState(deployment_id);
    expireStaleReservations(state, now);
    const pending = state.pending_reservations ?? {};
    if (pending[key]) return false;
    if (!cooldownElapsed(state.last_fired[key], cooldownSeconds, now)) return false;
    state.pending_reservations = { ...pending, [key]: new Date(now).toISOString() };
    writeState(state, deployment_id);
    return true;
  });
}

export async function confirmAlertFired(
  key: string,
  now = new Date(),
  deployment_id = currentDeploymentId(),
): Promise<void> {
  await withAlertCooldownLock(deployment_id, () => {
    const state = readState(deployment_id);
    state.last_fired[key] = now.toISOString();
    if (state.pending_reservations?.[key]) {
      delete state.pending_reservations[key];
      if (Object.keys(state.pending_reservations).length === 0) {
        delete state.pending_reservations;
      }
    }
    writeState(state, deployment_id);
  });
}

export async function confirmAlertFiredResilient(
  key: string,
  now = new Date(),
  deployment_id = currentDeploymentId(),
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < CONFIRM_RETRY_DELAYS_MS.length; attempt++) {
    const delay = CONFIRM_RETRY_DELAYS_MS[attempt]!;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      await confirmAlertFired(key, now, deployment_id);
      return;
    } catch (error) {
      lastError = error;
      log.warn("confirmAlertFired retry", {
        deployment_id,
        key,
        attempt: attempt + 1,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  log.error("confirmAlertFired failed after retries; forcing cooldown", {
    deployment_id,
    key,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  try {
    await confirmAlertFired(key, now, deployment_id);
  } catch (error) {
    log.error("confirmAlertFired resilient give up; notification already sent", {
      deployment_id,
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function releaseAlertReservation(
  key: string,
  deployment_id = currentDeploymentId(),
): Promise<void> {
  await withAlertCooldownLock(deployment_id, () => {
    const state = readState(deployment_id);
    if (!state.pending_reservations?.[key]) return;
    delete state.pending_reservations[key];
    if (Object.keys(state.pending_reservations).length === 0) {
      delete state.pending_reservations;
    }
    writeState(state, deployment_id);
  });
}

export async function wasAlertEverFired(
  key: string,
  deployment_id = currentDeploymentId(),
): Promise<boolean> {
  return withAlertCooldownLock(deployment_id, () => {
    const state = readState(deployment_id);
    return Boolean(state.last_fired[key]);
  });
}

export async function clearAlertCooldown(
  key: string,
  deployment_id = currentDeploymentId(),
): Promise<void> {
  await withAlertCooldownLock(deployment_id, () => {
    const state = readState(deployment_id);
    let changed = false;
    if (state.last_fired[key]) {
      delete state.last_fired[key];
      changed = true;
    }
    if (state.pending_reservations?.[key]) {
      delete state.pending_reservations[key];
      if (Object.keys(state.pending_reservations).length === 0) {
        delete state.pending_reservations;
      }
      changed = true;
    }
    if (changed) writeState(state, deployment_id);
  });
}
