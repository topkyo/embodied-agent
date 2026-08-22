import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createLogger } from "./logger.js";

const log = createLogger("jsonl-retention");

const TIMESTAMP_KEYS = ["updated_at", "recorded_at", "ts", "occurred_at", "created_at"] as const;

function parseRetentionDays(): number | null {
  const raw = process.env.RETENTION_DAYS?.trim();
  if (!raw) return null;
  const days = Number.parseInt(raw, 10);
  if (!Number.isFinite(days) || days <= 0) {
    log.warn("invalid RETENTION_DAYS; retention disabled", { value: raw });
    return null;
  }
  return days;
}

function rowTimestamp(row: Record<string, unknown>): string | null {
  for (const key of TIMESTAMP_KEYS) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

export function pruneJsonlByRetention(path: string, now = Date.now()): number {
  const days = parseRetentionDays();
  if (!days || !existsSync(path)) return 0;
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  const kept: string[] = [];
  let removed = 0;
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as Record<string, unknown>;
      const ts = rowTimestamp(row);
      if (!ts || Number.isNaN(Date.parse(ts))) {
        removed += 1;
        continue;
      }
      if (Date.parse(ts) >= cutoff) {
        kept.push(line);
      } else {
        removed += 1;
      }
    } catch {
      removed += 1;
    }
  }
  if (removed === 0) return 0;
  const tmp = `${path}.retention-tmp`;
  writeFileSync(tmp, kept.length ? `${kept.join("\n")}\n` : "", "utf8");
  renameSync(tmp, path);
  return removed;
}
