import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const API_HOST_DIR = join(REPO_ROOT, "apps/api/src");

const API_PACK_ID_SWITCH =
  /packId\s*===\s*["'](?:agriculture|robotics|industrial|aquaculture)["']|active_domain\s*===\s*["'](?:agriculture|robotics|industrial|aquaculture)["']/;

const API_PACK_SWITCH_ALLOWLIST = new Set([
  "apps/api/src/domain-packs/catalog.ts",
  "apps/api/src/platform-architecture-gate.test.ts",
]);

function isTestFile(file: string): boolean {
  return /\.test\.(ts|tsx)$/.test(file) || file.endsWith(".test-d.ts");
}

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "dist" || entry === "test") continue;
      files.push(...listSourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

function scanApiPackIdSwitches(): string[] {
  const offenders: string[] = [];
  for (const file of listSourceFiles(API_HOST_DIR)) {
    if (isTestFile(file)) continue;
    const rel = relative(REPO_ROOT, file);
    if (API_PACK_SWITCH_ALLOWLIST.has(rel)) continue;
    const text = readFileSync(file, "utf8");
    if (API_PACK_ID_SWITCH.test(text)) offenders.push(rel);
  }
  return offenders;
}

describe("api platform architecture gate", () => {
  it("keeps api production code free of packId domain switches", () => {
    expect(scanApiPackIdSwitches()).toEqual([]);
  });
});
