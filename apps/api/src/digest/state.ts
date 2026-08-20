import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { atomicWriteJson } from "@embodied-agent/platform";
import { deploymentScopedPath } from "../fs/deployment-path.js";

type DigestStateFile = {
  last_sent: Record<string, string>;
};

function statePath(): string {
  return deploymentScopedPath("digest-state.json");
}

function readState(): DigestStateFile {
  const p = statePath();
  if (!existsSync(p)) return { last_sent: {} };
  try {
    return JSON.parse(readFileSync(p, "utf8")) as DigestStateFile;
  } catch (err) {
    throw new Error(`${p} 无法读取或解析：${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}

function writeState(state: DigestStateFile): void {
  const path = statePath();
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteJson(path, state);
}

export function wasDigestSent(slotKey: string): boolean {
  return Boolean(readState().last_sent[slotKey]);
}

export function markDigestSent(slotKey: string, at = new Date()): void {
  const state = readState();
  state.last_sent[slotKey] = at.toISOString();
  writeState(state);
}

export function clearDigestState(): void {
  writeState({ last_sent: {} });
}
