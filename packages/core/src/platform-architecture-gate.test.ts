import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const PLATFORM_PACKAGE_DIRS = [
  "packages/core/src",
  "packages/node/src",
  "packages/agent/src",
  "packages/safety/src",
  "packages/platform/src",
  "packages/memory/src",
  "packages/runtime/src",
  "packages/alert-runtime/src",
];

const PACKAGE_DOMAIN_TERMS =
  /\b(greenhouse|greenhouses|greenhouse_id|irrigation|targetGreenhouse|temperature_c|humidity_percent|vent_motor|temp_high_c|temp_low_c|max_temp_c|humidity_delta_max|temperature_delta_max)\b/i;

const API_HOST_DIR = "apps/api/src";
const API_DOMAIN_PATTERNS = [
  /entity_type\s*===\s*["']greenhouse["']/,
  /entity_type\s*===\s*["']irrigation["']/,
];

const API_ALLOWLIST = new Set(["apps/api/src/domain-packs/pack-bound-service-implementations.ts"]);

const WEB_HOST_DIR = "apps/web/src";
const WEB_PACK_LITERAL =
  /===\s*["'](?:greenhouse|robot|industrial|aquaculture|coldchain|elderly|pet|agriculture|robotics)["']/;
const WEB_ALLOWLIST = new Set<string>([]);

const RUNTIME_PACK_ID_SWITCH =
  /packId\s*===\s*["'](?:agriculture|robotics|industrial|aquaculture)["']|active_domain\s*===\s*["'](?:agriculture|robotics|industrial|aquaculture)["']/;

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

function scanPackageDirs(): string[] {
  const offenders: string[] = [];
  for (const dir of PLATFORM_PACKAGE_DIRS) {
    for (const file of listSourceFiles(join(REPO_ROOT, dir))) {
      if (file.endsWith("platform-architecture-gate.test.ts")) continue;
      if (isTestFile(file)) continue;
      const text = readFileSync(file, "utf8");
      if (PACKAGE_DOMAIN_TERMS.test(text)) {
        offenders.push(relative(REPO_ROOT, file));
      }
    }
  }
  return offenders;
}

function scanRuntimePackIdSwitches(): string[] {
  const offenders: string[] = [];
  for (const file of listSourceFiles(join(REPO_ROOT, "packages/runtime/src"))) {
    if (isTestFile(file)) continue;
    if (file.endsWith("platform-architecture-gate.test.ts")) continue;
    const text = readFileSync(file, "utf8");
    if (RUNTIME_PACK_ID_SWITCH.test(text)) offenders.push(relative(REPO_ROOT, file));
  }
  return offenders;
}

function scanApiHost(): string[] {
  const offenders: string[] = [];
  for (const file of listSourceFiles(join(REPO_ROOT, API_HOST_DIR))) {
    if (isTestFile(file)) continue;
    const rel = relative(REPO_ROOT, file);
    if (API_ALLOWLIST.has(rel)) continue;
    const text = readFileSync(file, "utf8");
    if (API_DOMAIN_PATTERNS.some((pattern) => pattern.test(text))) {
      offenders.push(rel);
    }
  }
  return offenders;
}

function scanWebHostPackLiterals(): string[] {
  const offenders: string[] = [];
  for (const file of listSourceFiles(join(REPO_ROOT, WEB_HOST_DIR))) {
    if (isTestFile(file)) continue;
    const rel = relative(REPO_ROOT, file);
    if (WEB_ALLOWLIST.has(rel)) continue;
    const text = readFileSync(file, "utf8");
    if (WEB_PACK_LITERAL.test(text)) offenders.push(rel);
  }
  return offenders;
}

/**
 * 回归门禁：D1/ALS 关键运行时基础设施文件不得出现模块级全局单例状态。
 *
 * 范围声明（诚实且窄）：
 * 仅扫描 D1 重构确立的 context/holder/ALS 基础设施文件——这些文件有 context 可用，
 * 模块级可变状态不可接受。零豁免：这些文件中任何 `let` 或 `const` 可变容器直接 fail。
 *
 * 不在范围：进程级数据层（command store / telemetry / session / pending-confirm /
 * memory-journal / metrics / dedup 等 ~30+ 处模块级内存存储）。它们是合法的进程级
 * in-memory 数据层，非运行时基础设施单例；水平扩展时迁 Redis 是独立 epic。
 *
 * 扫描两类模块级可变状态：
 * - 裸 `let` 声明（column 0，非函数内）
 * - `const` 可变容器（空对象 `{}`、空数组 `[]`、`new Map/Set/WeakMap/WeakSet`、非空对象字面量且无 `as const`）
 */
const SINGLETON_FREE_FILES = [
  "packages/runtime/src/loader.ts",
  "packages/runtime/src/services.ts",
  "packages/agent/src/runtime-bindings.ts",
  "packages/node/src/mqtt/client.ts",
  "apps/api/src/runtime/context.ts",
  "apps/api/src/runtime/agent-context.ts",
];

const BARE_LET = /^(?:export\s+)?let\s+\w+/;
const DEFAULT_HOLDER_PATTERN = /default(?:Loader|Service|Agent)?Holder\b/;

// const 可变容器：空对象 / 空数组 / new Map|Set / 非空对象字面量（无 as const）
const MUTABLE_CONST_PATTERNS = [
  /^(?:export\s+)?const\s+\w+\s*(?::\s*[^=]+)?\s*=\s*\{\s*\}\s*;?$/,
  /^(?:export\s+)?const\s+\w+\s*(?::\s*[^=]+)?\s*=\s*\[\s*\]\s*;?$/,
  /^(?:export\s+)?const\s+\w+\s*(?::\s*[^=]+)?\s*=\s*new\s+(?:Map|Set|WeakMap|WeakSet)\b/,
  /^(?:export\s+)?const\s+\w+\s*(?::\s*[^=]+)?\s*=\s*\{(?!\s*\})[^}]*\}\s*(?!.*\bas\s+const\b)/,
];

function scanModuleLevelSingletons(): string[] {
  const offenders: string[] = [];
  for (const rel of SINGLETON_FREE_FILES) {
    const file = join(REPO_ROOT, rel);
    const text = readFileSync(file, "utf8");
    if (DEFAULT_HOLDER_PATTERN.test(text)) {
      offenders.push(`${rel}: defaultXxxHolder reference`);
    }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (BARE_LET.test(lines[i])) {
        offenders.push(`${rel}:${i + 1} bare module-level let`);
        continue;
      }
      if (MUTABLE_CONST_PATTERNS.some((p) => p.test(lines[i]))) {
        offenders.push(`${rel}:${i + 1} mutable module-level const container`);
      }
    }
  }
  return offenders;
}

describe("platform architecture gate", () => {
  it("keeps platform packages free of domain-specific terms", () => {
    expect(scanPackageDirs()).toEqual([]);
  });

  it("keeps api host production code free of hardcoded domain entity filters", () => {
    expect(scanApiHost()).toEqual([]);
  });

  it("keeps runtime production code free of packId domain switches", () => {
    expect(scanRuntimePackIdSwitches()).toEqual([]);
  });

  it("keeps web host free of hardcoded pack literal branches", () => {
    expect(scanWebHostPackLiterals()).toEqual([]);
  });

  it("keeps critical platform files free of bare module-level let singletons", () => {
    expect(scanModuleLevelSingletons()).toEqual([]);
  });
});
