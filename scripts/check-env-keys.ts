import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ENV_KEYS_DOC = "docs/operations/env-keys.zh.md";

// 提取依赖 rg；缺失时 `|| true` 会把错误吞成空集导致门禁假绿，必须 upfront 硬失败。
function assertRgAvailable(): void {
  try {
    execSync("rg --version", { stdio: "pipe" });
  } catch {
    console.error(
      "[env-keys-sync] 未检测到 ripgrep（rg）。环境变量提取会退化为空集导致门禁假绿，请先安装 ripgrep。",
    );
    process.exit(1);
  }
}
assertRgAvailable();

function extractCodeEnvVars(): Set<string> {
  const out = execSync(
    `rg -o "process\\.env\\.([A-Z_][A-Z_0-9]*)" apps/api/src packages/*/src scripts/*.ts scripts/lib/*.ts 2>/dev/null || true`,
  ).toString();
  const vars = new Set<string>();
  for (const line of out.split("\n")) {
    const m = line.match(/process\.env\.([A-Z_][A-Z_0-9]*)/);
    if (m) vars.add(m[1]!);
  }
  return vars;
}

function extractWebEnvVars(): Set<string> {
  const vars = new Set<string>();

  const srcOut = execSync(
    `rg -o "import\\.meta\\.env\\.(VITE_[A-Z_][A-Z_0-9]*)" apps/web/src 2>/dev/null || true`,
  ).toString();
  for (const line of srcOut.split("\n")) {
    const m = line.match(/import\.meta\.env\.(VITE_[A-Z_][A-Z_0-9]*)/);
    if (m) vars.add(m[1]!);
  }

  // vite.config.ts 经 loadEnv 消费（env.X 模式，含非 VITE_ 前缀如 WEB_PORT）
  const configOut = execSync(
    `rg -o "env\\.([A-Z_][A-Z_0-9]*)" apps/web/vite.config.ts 2>/dev/null || true`,
  ).toString();
  for (const line of configOut.split("\n")) {
    const m = line.match(/env\.([A-Z_][A-Z_0-9]*)/);
    if (m) vars.add(m[1]!);
  }

  // index.html 的 Vite html env 替换（%VITE_X% 模式）
  const htmlOut = execSync(
    `rg -o "%VITE_[A-Z_0-9]*%" apps/web/index.html 2>/dev/null || true`,
  ).toString();
  for (const line of htmlOut.split("\n")) {
    const m = line.match(/%(VITE_[A-Z_0-9]*)%/);
    if (m) vars.add(m[1]!);
  }

  return vars;
}

function extractDocEnvVars(): Set<string> {
  const doc = readFileSync(ENV_KEYS_DOC, "utf8");
  const vars = new Set<string>();
  for (const line of doc.split("\n")) {
    // 提取表格首列反引号包裹的环境变量名（可能有多个用 / 分隔）
    const cells = line.split("|").map((c) => c.trim());
    for (const cell of cells) {
      const matches = cell.matchAll(/`([A-Z_][A-Z_0-9]*)`/g);
      for (const m of matches) {
        vars.add(m[1]!);
      }
    }
  }
  return vars;
}

function extractDocDefaults(): Map<string, string> {
  const doc = readFileSync(ENV_KEYS_DOC, "utf8");
  const defaults = new Map<string, string>();
  for (const line of doc.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 6) continue;
    const envMatch = cells[1]?.match(/^`([A-Z_][A-Z_0-9]*)`$/);
    if (!envMatch) continue;
    defaults.set(envMatch[1]!, cells[4]?.replaceAll("`", "") ?? "");
  }
  return defaults;
}

const codeVars = new Set([...extractCodeEnvVars(), ...extractWebEnvVars()]);
const docVars = extractDocEnvVars();
const docDefaults = extractDocDefaults();

// 允许动态运行时环境变量（非配置真源）
const ignoreDynamic = new Set([
  "SIM_TELEMETRY_SCENARIO",
  "SIM_TELEMETRY_REACT",
  "SIM_MAX_COMMAND_MS",
  "SUSTAINED_ALERT_MINUTES",
  "SUSTAINED_L2_COOLDOWN_SECONDS",
  "SCENE_OUTCOME_WINDOWS_MINUTES",
  "DEVICE_HEARTBEAT_TIMEOUT_MS",
  "MATRIX_WECHAT_PATH_OVERRIDE",
  "MATRIX_WECHAT_PATH",
  "SKIP_DOMAIN_FLYWHEEL",
  "EVAL_WRITE_DOCS",
  "ENSURE_SIM_DUAL_FORCE_REBIND",
]);

const missing = [...codeVars].filter((v) => !docVars.has(v) && !ignoreDynamic.has(v));
const expectedDefaults = new Map<string, string>([
  ["COMMAND_DELIVERY_TTL_MS", "30000"],
  ["COMMAND_ACK_TIMEOUT_MS", "15000"],
  ["COMMAND_RETRY_INTERVAL_MS", "5000"],
  ["COMMAND_MAX_RETRIES", "2"],
  ["ROUTER_CONFIG_WAIT_MS", "800"],
  ["WATCHER_CONFIG_WAIT_MS", "300"],
  ["CONFIG_PUBLISH_COOLDOWN_MS", "10000"],
]);
const defaultDrift = [...expectedDefaults.entries()].filter(
  ([env, expected]) => docDefaults.get(env) !== expected,
);

if (missing.length > 0) {
  console.error(
    "[env-keys-sync] 以下环境变量在代码中引用但未在 docs/operations/env-keys.zh.md 索引：",
  );
  for (const v of missing) console.error(`  ${v}`);
  console.error(
    `共 ${missing.length} 个未索引变量。请补充到 docs/operations/env-keys.zh.md 或加入 ignoreDynamic。`,
  );
  process.exit(1);
}
if (defaultDrift.length > 0) {
  console.error("[env-keys-sync] 以下环境变量默认值与 docs/operations/env-keys.zh.md 不一致：");
  for (const [env, expected] of defaultDrift) {
    console.error(`  ${env}: expected ${expected}, got ${docDefaults.get(env) ?? "<missing>"}`);
  }
  console.error("请同步代码默认值与 docs/operations/env-keys.zh.md 的“缺失时”列。");
  process.exit(1);
}
console.log(
  `[env-keys-sync] OK: ${codeVars.size} 个环境变量，${docVars.size} 个已索引（${ignoreDynamic.size} 个动态变量豁免）`,
);
