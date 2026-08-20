import { resolveAgentDataDir } from "@embodied-agent/platform";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createFetchLlmClient,
  LlmUnavailableError,
  type DeploymentContext,
  type LlmChatTurn,
} from "@embodied-agent/agent";
import { loadRegistry } from "@embodied-agent/node";
import { resolveActiveEvalConfig } from "@embodied-agent/runtime";
import { buildSceneDeploymentContext } from "../../apps/api/src/domain-packs/loader.js";
import { getEffectiveSettings } from "../../apps/api/src/settings/store.js";
import { bindScriptRuntime, getScriptPlatformRuntimeContext } from "./bind-script-runtime.js";

await bindScriptRuntime();

export type GoldenExpectation = {
  target?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
};

function activeEvalConfig() {
  configureGatewayDataDir();
  return resolveActiveEvalConfig(getScriptPlatformRuntimeContext().loader, getEffectiveSettings());
}

export function goldenEvalPaths(): string[] {
  return activeEvalConfig().goldenPaths;
}

export function matrixExtraPaths(): string[] {
  return activeEvalConfig().matrixExtraPaths;
}

export function matrixWechatPaths(): string[] {
  return activeEvalConfig().matrixWechatPaths;
}

export function matrixNegativePaths(): string[] {
  return activeEvalConfig().matrixNegativePaths;
}

export const GOLDEN_EVAL_PATH = goldenEvalPaths()[0]!;
export const MATRIX_EXTRA_PATH = matrixExtraPaths()[0]!;
export const MATRIX_WECHAT_PATH = matrixWechatPaths()[0]!;
export const MATRIX_NEGATIVE_PATH = matrixNegativePaths()[0]!;
export const ACTIVE_EVAL_DOMAIN_PACK = activeEvalConfig().packIds.join(",");

export function activeDomainId(settings = getEffectiveSettings()): string {
  const activeDomain = settings.active_domain?.trim();
  if (!activeDomain) {
    throw new Error("active_domain 未配置，无法生成 eval evidence。");
  }
  return activeDomain;
}

export function activeDomainConfig(settings = getEffectiveSettings()): unknown {
  return settings.domain_configs?.[activeDomainId(settings)];
}

export function resolveMatrixWechatPath(): string {
  const staging = process.env.SIM_MATRIX_WECHAT_STAGING?.trim();
  if (staging) return resolve(staging);
  const override = process.env.MATRIX_WECHAT_PATH_OVERRIDE?.trim();
  if (override) return resolve(override);
  const paths = matrixWechatPaths();
  if (paths.length !== 1) {
    throw new Error(
      `MATRIX_WECHAT_PATH_OVERRIDE 须在多 Domain Pack 时显式设置（当前 ${paths.length} 个 pack）`,
    );
  }
  return paths[0]!;
}

export type MatrixSource = "golden" | "extra" | "wechat" | "negative";

export type IntentMatrixRow = {
  id: number;
  utterance: string;
  expected_skill: string;
  expected?: GoldenExpectation;
  /** 多轮：与 pipeline 一致，在送 LLM 前先做 STT 归一化 */
  normalize?: boolean;
  history?: readonly LlmChatTurn[];
  note?: string;
  source?: MatrixSource;
};

export function loadMatrixSlices(): {
  core: IntentMatrixRow[];
  wechat: IntentMatrixRow[];
  negative: IntentMatrixRow[];
  all: IntentMatrixRow[];
} {
  const evalConfig = activeEvalConfig();
  const golden = evalConfig.goldenPaths
    .flatMap((path) => loadGoldenRows(path))
    .map((row) => ({
      ...row,
      source: "golden" as const,
    }));
  const extra = evalConfig.matrixExtraPaths
    .flatMap((path) => loadGoldenRows(path))
    .map((row) => ({
      ...row,
      source: "extra" as const,
    }));
  if (golden.length === 0 || extra.length === 0) {
    throw new Error(
      `核心矩阵 golden/extra 均须非空（golden ${golden.length} + extra ${extra.length}）`,
    );
  }
  const coreRaw = [...golden, ...extra];
  const coreMatrixSize = coreRaw.length;
  const wechatRaw = loadGoldenRows(resolveMatrixWechatPath()).map((row) => ({
    ...row,
    source: "wechat" as const,
  }));
  const negativeRaw = evalConfig.matrixNegativePaths
    .flatMap((path) => loadGoldenRows(path))
    .map((row) => ({
      ...row,
      source: "negative" as const,
    }));
  if (negativeRaw.length === 0) {
    throw new Error("negative matrix 须非空，防止跨领域误触发缺少门禁。");
  }
  const core = coreRaw.map((row, i) => ({ ...row, id: i + 1 }));
  const wechat = wechatRaw.map((row, i) => ({
    ...row,
    id: coreMatrixSize + i + 1,
  }));
  const negative = negativeRaw.map((row, i) => ({
    ...row,
    id: coreMatrixSize + wechat.length + i + 1,
  }));
  return { core, wechat, negative, all: [...core, ...wechat, ...negative] };
}

export function configureGatewayDataDir(): void {
  if (process.env.AGENT_DATA_DIR?.trim()) return;
  process.env.AGENT_DATA_DIR = resolveAgentDataDir();
}

export function envBool(name: string): boolean | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  return raw === "1" || raw === "true" || raw === "enabled";
}

export function loadGoldenRows(path: string): Omit<IntentMatrixRow, "id">[] {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Omit<IntentMatrixRow, "id">);
}

export function sameJsonValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function matchesExpectation(
  row: Pick<IntentMatrixRow, "expected_skill" | "expected">,
  parsed: unknown,
): boolean {
  if (!parsed || typeof parsed !== "object") return false;
  const obj = parsed as Record<string, unknown>;
  if (row.expected_skill === "clarification_needed") {
    return obj.skill === "clarification_needed";
  }
  if (obj.skill !== row.expected_skill) return false;
  if (row.expected?.target) {
    const target = obj.target as Record<string, unknown> | undefined;
    for (const [k, v] of Object.entries(row.expected.target)) {
      if (!sameJsonValue(target?.[k], v)) return false;
    }
  }
  if (row.expected?.parameters) {
    const params = obj.parameters as Record<string, unknown> | undefined;
    for (const [k, v] of Object.entries(row.expected.parameters)) {
      if (!sameJsonValue(params?.[k], v)) return false;
    }
  }
  return true;
}

export function createLlmClientFromSettings() {
  configureGatewayDataDir();
  const settings = getEffectiveSettings();
  const model = process.env.LLM_MODEL ?? settings.llm_model;
  const client = createFetchLlmClient({
    apiKey: settings.llm_api_key ?? process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_BASE_URL ?? settings.llm_base_url,
    model,
    thinking: envBool("LLM_THINKING") ?? settings.llm_thinking,
  });
  return { client, model, settings };
}

export function loadDeploymentContextFromRegistry(): DeploymentContext {
  configureGatewayDataDir();
  const settings = getEffectiveSettings();
  const registry = loadRegistry();
  const sceneContext = buildSceneDeploymentContext(
    getScriptPlatformRuntimeContext().loader,
    settings,
    registry,
  );
  if (sceneContext.scene_context_sections.length > 0) {
    return sceneContext;
  }
  throw new Error(
    `active_domain ${settings.active_domain} 未生成部署上下文，请补齐 Domain Pack context.buildDeploymentContext 或 registry。`,
  );
}

export function requireLlmClient() {
  try {
    return createLlmClientFromSettings();
  } catch (e) {
    if (e instanceof LlmUnavailableError) {
      console.error(
        "需要真实 LLM：请在 Web 配置台填写 API Key，或设置 LLM_API_KEY / AGENT_DATA_DIR。",
      );
      process.exit(1);
    }
    throw e;
  }
}
