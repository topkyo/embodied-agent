import { copyFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { AgentRuntimeBindings } from "../runtime-bindings.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
import {
  loadIntentFailures,
  markFailurePromoted,
  type IntentFailureCase,
} from "./failure-store.js";
import {
  buildWechatRow,
  isPromotableToWechat,
  utteranceInMatrix,
  type WechatMatrixDraft,
} from "./promote-wechat-lib.js";

function primaryEvalPaths(bindings: AgentRuntimeBindings) {
  return bindings.resolvePrimaryEvalPaths();
}

function goldenEvalPath(bindings: AgentRuntimeBindings): string {
  return primaryEvalPaths(bindings).golden;
}

function repoMatrixWechatPath(bindings: AgentRuntimeBindings): string {
  return primaryEvalPaths(bindings).matrixWechat;
}

export type ValidatePromoteRequestResult =
  { ok: true } | { ok: false; error: string; httpStatus: 400 | 404 };

export type PromoteWechatResultItem = {
  id: string;
  utterance: string;
  status: "promoted" | "skipped" | "failed" | "dry_run";
  error?: string;
};

export type PromoteWechatResult = {
  ok: boolean;
  promoted: number;
  skipped: number;
  failed: number;
  sim_exit_code?: number;
  results: PromoteWechatResultItem[];
  error?: string;
};

export type PromoteWechatOptions = {
  ids?: string[];
  dryRun?: boolean;
  /** Admin HTTP 路径传入；受环境守卫约束 */
  fromApi?: boolean;
  /** CLI 可继承 stdio；API 默认 pipe */
  stdioInherit?: boolean;
  /** 单测注入，跳过真实 sim:matrix */
  runMatrix?: () => number | Promise<number>;
};

function matrixWechatPath(bindings: AgentRuntimeBindings): string {
  const override = process.env.MATRIX_WECHAT_PATH_OVERRIDE?.trim();
  if (override) return resolve(override);
  return resolve(bindings.dataRoot(), "sim-matrix-wechat.jsonl");
}

function matrixStagingPath(bindings: AgentRuntimeBindings): string {
  return `${matrixWechatPath(bindings)}.staging`;
}

export function recoverStalePromoteStaging(bindings: AgentRuntimeBindings): void {
  const staging = matrixStagingPath(bindings);
  if (existsSync(staging)) {
    try {
      unlinkSync(staging);
    } catch {
      /* staging may be mid-write */
    }
  }
}

function ensureWechatMatrixSeed(bindings: AgentRuntimeBindings): void {
  const path = matrixWechatPath(bindings);
  if (existsSync(path)) return;
  const seed = repoMatrixWechatPath(bindings);
  if (existsSync(seed)) {
    copyFileSync(seed, path);
  }
}

function promoteLockPath(bindings: AgentRuntimeBindings): string {
  return resolve(bindings.dataRoot(), "intent-promote-wechat.lock");
}

function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME,
  );
}

/**
 * API 触发的 promote 会 spawn 完整 sim matrix，属于昂贵操作：
 * 默认拒绝，必须显式 INTENT_PROMOTE_WECHAT_API=1 才放行（失败可见，不隐式兜底）。
 * serverless 额外要求 INTENT_PROMOTE_WECHAT_ALLOW_SERVERLESS=1。
 */
export function isWechatPromoteFromApiAllowed(): boolean {
  const raw = process.env.INTENT_PROMOTE_WECHAT_API?.trim();
  if (raw === "0" || raw === "false") return false;
  if (isServerlessRuntime()) {
    const allow =
      process.env.INTENT_PROMOTE_WECHAT_ALLOW_SERVERLESS?.trim() === "1" ||
      process.env.INTENT_PROMOTE_WECHAT_ALLOW_SERVERLESS?.trim() === "true";
    return (raw === "1" || raw === "true") && allow;
  }
  return raw === "1" || raw === "true";
}

function loadGoldenRows(path: string): WechatMatrixDraft[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as WechatMatrixDraft);
}

function removeStagingFile(bindings: AgentRuntimeBindings): void {
  const staging = matrixStagingPath(bindings);
  if (!existsSync(staging)) return;
  try {
    unlinkSync(staging);
  } catch {
    /* ignore */
  }
}

function commitStagingMatrix(bindings: AgentRuntimeBindings): void {
  const staging = matrixStagingPath(bindings);
  if (!existsSync(staging)) return;
  const content = readFileSync(staging, "utf8");
  bindings.atomicWriteText(matrixWechatPath(bindings), content);
  removeStagingFile(bindings);
}

async function runWechatMatrix(
  bindings: AgentRuntimeBindings,
  stdioInherit: boolean,
  matrixPath: string,
): Promise<number> {
  const timeoutMs = bindings.matrixTimeoutMs();
  const env = {
    ...process.env,
    SIM_MATRIX_SLICE: "wechat",
    SIM_MATRIX_WECHAT_STAGING: matrixPath,
  };
  const simScript = resolve(REPO_ROOT, "scripts/simulate-user-matrix.ts");
  const cmd = process.platform === "win32" ? "npx.cmd" : "npx";

  return new Promise((resolveExit) => {
    const child = spawn(cmd, ["tsx", simScript], {
      cwd: REPO_ROOT,
      env,
      stdio: stdioInherit ? "inherit" : "pipe",
    });
    let timedOut = false;
    const timer =
      Number.isFinite(timeoutMs) && timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, timeoutMs)
        : undefined;

    child.on("error", () => {
      if (timer) clearTimeout(timer);
      resolveExit(1);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolveExit(timedOut ? 124 : (code ?? 1));
    });
  });
}

function selectCandidates(bindings: AgentRuntimeBindings, ids?: string[]): IntentFailureCase[] {
  const pending = loadIntentFailures(bindings).filter((r) => !r.promoted);
  const scoped = ids?.length ? pending.filter((r) => ids.includes(r.id)) : pending;
  return scoped.filter((r) => isPromotableToWechat(bindings, r));
}

export function validatePromoteRequest(
  bindings: AgentRuntimeBindings,
  ids: string[],
): ValidatePromoteRequestResult {
  const all = loadIntentFailures(bindings);
  const missing = ids.filter((id) => !all.some((r) => r.id === id));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `case not found: ${missing.join(", ")}`,
      httpStatus: 404,
    };
  }
  const blocked = ids
    .map((id) => all.find((r) => r.id === id))
    .filter((r): r is IntentFailureCase => Boolean(r))
    .filter((r) => !isPromotableToWechat(bindings, r));
  if (blocked.length > 0) {
    return {
      ok: false,
      error: "case is not promotable to wechat",
      httpStatus: 400,
    };
  }
  return { ok: true };
}

function idValidationFailure(
  bindings: AgentRuntimeBindings,
  ids: string[],
): PromoteWechatResult | null {
  const validation = validatePromoteRequest(bindings, ids);
  if (validation.ok) return null;
  if (validation.httpStatus === 404) {
    return {
      ok: false,
      promoted: 0,
      skipped: 0,
      failed: 0,
      results: [],
      error: validation.error,
    };
  }
  const all = loadIntentFailures(bindings);
  const blocked = ids
    .map((id) => all.find((r) => r.id === id))
    .filter((r): r is IntentFailureCase => Boolean(r))
    .filter((r) => !isPromotableToWechat(bindings, r));
  return {
    ok: false,
    promoted: 0,
    skipped: 0,
    failed: blocked.length,
    results: blocked.map((r) => ({
      id: r.id,
      utterance: r.utterance,
      status: "failed" as const,
      error: "not_promotable",
    })),
    error: validation.error,
  };
}

async function runPromote(
  bindings: AgentRuntimeBindings,
  opts: PromoteWechatOptions,
): Promise<PromoteWechatResult> {
  const { ids, dryRun = false, stdioInherit = false, runMatrix } = opts;
  recoverStalePromoteStaging(bindings);
  ensureWechatMatrixSeed(bindings);
  const matrixPath = matrixWechatPath(bindings);
  const golden = loadGoldenRows(goldenEvalPath(bindings));
  const candidates = selectCandidates(bindings, ids);

  if (ids?.length && candidates.length === 0) {
    const failure = idValidationFailure(bindings, ids);
    if (failure) return failure;
  }

  if (candidates.length === 0) {
    return {
      ok: true,
      promoted: 0,
      skipped: 0,
      failed: 0,
      results: [],
    };
  }

  const results: PromoteWechatResultItem[] = [];
  const draftsToAppend: WechatMatrixDraft[] = [];
  const appended: { id: string; utterance: string }[] = [];

  for (const c of candidates) {
    const freshWechat = loadGoldenRows(matrixPath);
    if (utteranceInMatrix(c.utterance, freshWechat) || utteranceInMatrix(c.utterance, golden)) {
      if (!dryRun) markFailurePromoted(bindings, c.id, "skipped");
      results.push({
        id: c.id,
        utterance: c.utterance,
        status: "skipped",
        error: "duplicate_utterance",
      });
      continue;
    }

    const draft = buildWechatRow(bindings, c);
    if (!draft) {
      results.push({
        id: c.id,
        utterance: c.utterance,
        status: "failed",
        error: "build_row_failed",
      });
      continue;
    }

    if (dryRun) {
      results.push({
        id: c.id,
        utterance: c.utterance,
        status: "dry_run",
      });
      continue;
    }

    draftsToAppend.push(draft);
    appended.push({ id: c.id, utterance: c.utterance });
  }

  if (dryRun) {
    return {
      ok: true,
      promoted: 0,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    };
  }

  if (appended.length === 0) {
    return {
      ok: true,
      promoted: 0,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    };
  }

  const stagingPath = matrixStagingPath(bindings);
  const merged = [...loadGoldenRows(matrixPath), ...draftsToAppend];
  bindings.atomicWriteText(
    stagingPath,
    merged.length > 0 ? `${merged.map((r) => JSON.stringify(r)).join("\n")}\n` : "",
  );

  const simExitCode = runMatrix
    ? await runMatrix()
    : await runWechatMatrix(bindings, stdioInherit, stagingPath);
  if (simExitCode !== 0) {
    removeStagingFile(bindings);
    for (const a of appended) {
      results.push({
        id: a.id,
        utterance: a.utterance,
        status: "failed",
        error: "wechat_matrix_failed",
      });
    }
    return {
      ok: false,
      promoted: 0,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
      sim_exit_code: simExitCode,
      results,
      error: "wechat matrix validation failed; staging discarded",
    };
  }

  commitStagingMatrix(bindings);

  for (const a of appended) {
    markFailurePromoted(bindings, a.id, "wechat");
    results.push({
      id: a.id,
      utterance: a.utterance,
      status: "promoted",
    });
  }

  return {
    ok: true,
    promoted: appended.length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    sim_exit_code: simExitCode,
    results,
  };
}

export async function promoteCasesToWechat(
  bindings: AgentRuntimeBindings,
  opts: PromoteWechatOptions = {},
): Promise<PromoteWechatResult> {
  const { dryRun = false, fromApi = false } = opts;

  if (fromApi && !isWechatPromoteFromApiAllowed()) {
    return {
      ok: false,
      promoted: 0,
      skipped: 0,
      failed: 0,
      results: [],
      error:
        "wechat promote via API is disabled in this environment; use npm run intent:failures:promote-wechat",
    };
  }

  if (dryRun) {
    return runPromote(bindings, opts);
  }

  try {
    return await bindings.withFileLock(promoteLockPath(bindings), () => runPromote(bindings, opts));
  } catch (e) {
    if (e instanceof bindings.FileLockBusyError) {
      return {
        ok: false,
        promoted: 0,
        skipped: 0,
        failed: 0,
        results: [],
        error: "promote already in progress",
      };
    }
    throw e;
  }
}
