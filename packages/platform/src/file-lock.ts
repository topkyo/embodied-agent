import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { dirname } from "node:path";

export class FileLockBusyError extends Error {
  constructor(readonly lockPath: string) {
    super(`lock busy: ${lockPath}`);
    this.name = "FileLockBusyError";
  }
}

type LockMeta = {
  pid: number;
  started_at: string;
};

const DEFAULT_MATRIX_TIMEOUT_MS = 600_000;

export function matrixTimeoutMs(): number {
  const raw = process.env.INTENT_PROMOTE_MATRIX_TIMEOUT_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_MATRIX_TIMEOUT_MS;
}

function staleLockMs(): number {
  const raw = process.env.FILE_LOCK_STALE_MS?.trim();
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return matrixTimeoutMs();
}

export function validateFileLockStaleConfig(): void {
  const raw = process.env.FILE_LOCK_STALE_MS?.trim();
  if (!raw) return;
  const stale = Number(raw);
  if (!Number.isFinite(stale) || stale <= 0) return;
  const matrix = matrixTimeoutMs();
  if (stale < matrix) {
    throw new Error(
      `FILE_LOCK_STALE_MS (${stale}) must be >= INTENT_PROMOTE_MATRIX_TIMEOUT_MS (${matrix})`,
    );
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLockMeta(lockPath: string): LockMeta | null {
  try {
    const raw = readFileSync(lockPath, "utf8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LockMeta;
    if (typeof parsed.pid !== "number" || typeof parsed.started_at !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isStaleLock(lockPath: string): boolean {
  const meta = readLockMeta(lockPath);
  if (!meta) return true;
  if (isPidAlive(meta.pid)) return false;
  const started = Date.parse(meta.started_at);
  if (!Number.isFinite(started)) return true;
  return Date.now() - started > staleLockMs();
}

function tryAcquire(lockPath: string): number {
  return openSync(lockPath, "wx");
}

function writeLockMeta(fd: number): void {
  const meta: LockMeta = {
    pid: process.pid,
    started_at: new Date().toISOString(),
  };
  writeSync(fd, `${JSON.stringify(meta)}\n`, undefined, "utf8");
}

function acquireLock(lockPath: string): number {
  mkdirSync(dirname(lockPath), { recursive: true });
  try {
    return tryAcquire(lockPath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EEXIST" && isStaleLock(lockPath)) {
      try {
        unlinkSync(lockPath);
      } catch {
        /* race with another reclaimer */
      }
      return tryAcquire(lockPath);
    }
    if ((e as NodeJS.ErrnoException).code === "EEXIST") {
      throw new FileLockBusyError(lockPath);
    }
    throw e;
  }
}

function releaseLock(lockPath: string, fd: number): void {
  closeSync(fd);
  try {
    unlinkSync(lockPath);
  } catch {
    /* lock may already be gone */
  }
}

export async function withFileLock<T>(lockPath: string, fn: () => T | Promise<T>): Promise<T> {
  let fd: number | undefined;
  try {
    fd = acquireLock(lockPath);
    writeLockMeta(fd);
    return await fn();
  } finally {
    if (fd !== undefined) releaseLock(lockPath, fd);
  }
}

/** 同步变体：供无法 async 的调用链（如 IM principal 解析）做本地文件互斥。 */
export function withFileLockSync<T>(lockPath: string, fn: () => T): T {
  let fd: number | undefined;
  try {
    fd = acquireLock(lockPath);
    writeLockMeta(fd);
    return fn();
  } finally {
    if (fd !== undefined) releaseLock(lockPath, fd);
  }
}
