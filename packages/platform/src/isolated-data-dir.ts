import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function allocateAgentDataDir(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `embodied-agent-${label}-`));
  process.env.AGENT_DATA_DIR = dir;
  return dir;
}

export function releaseAgentDataDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  if (process.env.AGENT_DATA_DIR === dir) {
    delete process.env.AGENT_DATA_DIR;
  }
}
