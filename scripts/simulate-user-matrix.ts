/**
 * 意图话术矩阵 — **仅真实 LLM**（Flash + Pro 升格，与微信 pipeline 一致）。
 *
 * 按 active Domain Pack 加载 eval corpus；复合查询委托 active pack conversation capability。
 *
 * 用法:
 *   AGENT_DATA_DIR=scripts/fixtures/ci-eval npm run sim:matrix
 *   AGENT_DATA_DIR=scripts/fixtures/ci-industrial-eval SIM_MATRIX_SLICE=core npm run sim:matrix
 */
import {
  createIntentResolver,
  isUserCorrectionUtterance,
  type DeploymentContext,
  type IntentResolver,
} from "@embodied-agent/agent";
import {
  buildCompoundDeploymentWeatherIntents,
  isCompoundDeploymentWeatherQuery,
} from "../apps/api/src/chat/compound-query.js";
import { bindScriptRuntime, getScriptAgentRuntimeContext } from "./lib/bind-script-runtime.js";

import {
  ACTIVE_EVAL_DOMAIN_PACK,
  GOLDEN_EVAL_PATH,
  MATRIX_EXTRA_PATH,
  MATRIX_NEGATIVE_PATH,
  MATRIX_WECHAT_PATH,
  activeDomainConfig,
  activeDomainId,
  configureGatewayDataDir,
  envBool,
  loadDeploymentContextFromRegistry,
  loadMatrixSlices,
  matchesExpectation,
  requireLlmClient,
  type IntentMatrixRow,
  type MatrixSource,
} from "./lib/intent-eval-common.js";
import {
  buildSimMatrixCorpusEvidence,
  buildSimMatrixEvidenceFingerprint,
  signSimMatrixReportEvidence,
} from "@embodied-agent/runtime";
import { writeLocalEvalReport, writeRuntimeEvalEvidence } from "./lib/eval-report-output.js";

const CORE_MIN_PASS = Number(process.env.SIM_MATRIX_MIN_PASS_RATE ?? "0.9");
const WECHAT_MIN_PASS = Number(process.env.SIM_MATRIX_WECHAT_MIN_PASS_RATE ?? "1");
const NEGATIVE_MIN_PASS = Number(process.env.SIM_MATRIX_NEGATIVE_MIN_PASS_RATE ?? "1");
const DELAY_MS = Number(process.env.SIM_MATRIX_DELAY_MS ?? "150");
const SLICE = process.env.SIM_MATRIX_SLICE?.trim(); // core | wechat | negative | 空=全部
const VALID_SLICES = new Set(["core", "wechat", "negative"]);

type RowResult = {
  id: number;
  utterance: string;
  source: MatrixSource;
  ok: boolean;
  expected_skill: string;
  actual?: string;
  detail?: string;
  model: string;
  escalated?: boolean;
  escalation_reason?: string;
  note?: string;
  latency_ms?: number;
  row_hash?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function summarize(
  results: RowResult[],
  source: MatrixSource | "all" | "core",
): { passed: number; total: number; rate: number } {
  const subset =
    source === "all"
      ? results
      : source === "core"
        ? results.filter((r) => r.source === "golden" || r.source === "extra")
        : results.filter((r) => r.source === source);
  const passed = subset.filter((r) => r.ok).length;
  return {
    passed,
    total: subset.length,
    rate: subset.length ? passed / subset.length : 1,
  };
}

function latencyStats(results: RowResult[]): {
  p50_ms: number;
  p95_ms: number;
  max_ms: number;
} {
  const values = results
    .map((result) => result.latency_ms)
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b);
  if (values.length === 0) return { p50_ms: 0, p95_ms: 0, max_ms: 0 };
  const percentile = (p: number) => {
    const index = Math.min(values.length - 1, Math.ceil(values.length * p) - 1);
    return values[index] ?? 0;
  };
  return {
    p50_ms: percentile(0.5),
    p95_ms: percentile(0.95),
    max_ms: values[values.length - 1] ?? 0,
  };
}

async function evalRow(
  row: IntentMatrixRow,
  deploymentContext: DeploymentContext,
  deps: ReturnType<typeof requireLlmClient>,
  resolver: IntentResolver,
): Promise<RowResult> {
  const started = Date.now();
  const text = row.normalize === true ? resolver.normalizeUtterance(row.utterance) : row.utterance;
  let escalated = false;
  let escalation_reason: string | undefined;

  if (isCompoundDeploymentWeatherQuery(text)) {
    const { weather } = buildCompoundDeploymentWeatherIntents(deps.settings.deployment_id);
    const raw = {
      skill: weather.skill,
      target: weather.target,
      parameters: weather.parameters,
    };
    const ok = matchesExpectation(row, raw);
    return {
      id: row.id,
      utterance: row.utterance,
      source: row.source ?? "extra",
      expected_skill: row.expected_skill,
      model: deps.model,
      escalated: false,
      note: row.note,
      latency_ms: Date.now() - started,
      ok,
      actual: raw.skill,
      detail: ok ? undefined : JSON.stringify(raw),
    };
  }

  const { result } = await resolver.resolveWithEscalation(
    text,
    deploymentContext,
    { llmClient: deps.client, model: deps.model },
    {
      history: row.history,
      forcePro: isUserCorrectionUtterance(text),
      onEscalate: (info) => {
        escalated = true;
        escalation_reason = info.reason;
      },
    },
  );
  const latency_ms = Date.now() - started;
  const base = {
    id: row.id,
    utterance: row.utterance,
    source: row.source ?? "extra",
    expected_skill: row.expected_skill,
    model: deps.model,
    escalated,
    escalation_reason,
    note: row.note,
    latency_ms,
  };

  if (!result.ok) {
    return {
      ...base,
      ok: false,
      detail: "LLM 不可用",
    };
  }

  if (result.validation.kind === "clarification") {
    const ok = row.expected_skill === "clarification_needed";
    return {
      ...base,
      ok,
      actual: "clarification",
      detail: ok ? undefined : result.validation.message.slice(0, 120),
    };
  }

  const raw = {
    skill: result.validation.intent.skill,
    target: result.validation.intent.target,
    parameters:
      "parameters" in result.validation.intent ? result.validation.intent.parameters : undefined,
  };
  const ok = matchesExpectation(row, raw);
  return {
    ...base,
    ok,
    actual: raw.skill,
    detail: ok ? undefined : JSON.stringify(raw),
  };
}

async function main(): Promise<void> {
  // 模块顶层 TLA 中 enterWith 的 ALS 上下文不会传播到 main() 的 async 链路，
  // 幂等重绑一次让 compound-query 等 ALS 消费方可见 PlatformRuntimeContext。
  await bindScriptRuntime();
  configureGatewayDataDir();
  if (SLICE && !VALID_SLICES.has(SLICE)) {
    throw new Error(`SIM_MATRIX_SLICE 只允许 core / wechat / negative，当前为 ${SLICE}`);
  }
  if (!SLICE) {
    throw new Error("交付 evidence 必须显式设置 SIM_MATRIX_SLICE=core/wechat/negative。");
  }
  const matrixSlice = SLICE as "core" | "wechat" | "negative";
  if (process.env.MATRIX_WECHAT_PATH_OVERRIDE?.trim()) {
    throw new Error("交付 evidence 不允许使用 MATRIX_WECHAT_PATH_OVERRIDE。");
  }
  const wechatStaging = process.env.SIM_MATRIX_WECHAT_STAGING?.trim();
  const deps = requireLlmClient();
  const resolver = createIntentResolver(getScriptAgentRuntimeContext());
  const deploymentContext = loadDeploymentContextFromRegistry();
  const { core, wechat, negative } = loadMatrixSlices();
  const rows = matrixSlice === "core" ? core : matrixSlice === "wechat" ? wechat : negative;
  const results: RowResult[] = [];
  const failures: string[] = [];

  console.log(
    `[sim-matrix] 真实 LLM model=${deps.model} core=${core.length} wechat=${wechat.length} negative=${negative.length} run=${rows.length} escalation=on`,
  );

  for (const row of rows) {
    const rowResult = await evalRow(row, deploymentContext, deps, resolver);
    results.push(rowResult);
    if (!rowResult.ok) {
      const tag = rowResult.source === "wechat" ? "[wechat]" : "";
      failures.push(
        `#${rowResult.id}${tag} ${row.utterance} → expected ${row.expected_skill} got ${rowResult.detail ?? rowResult.actual}`,
      );
    }
    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }

  const coreStats = summarize(results, "core");
  const wechatStats = summarize(results, "wechat");
  const negativeStats = summarize(results, "negative");
  const allStats =
    SLICE === "core"
      ? coreStats
      : SLICE === "wechat"
        ? wechatStats
        : SLICE === "negative"
          ? negativeStats
          : summarize(results, "all");
  const escalatedCount = results.filter((result) => result.escalated).length;
  const packId = ACTIVE_EVAL_DOMAIN_PACK;
  const safePackId = packId.replace(/[^a-z0-9_-]/gi, "-");
  const sliceName = (SLICE ?? "all").replace(/[^a-z0-9_-]/gi, "-");
  const reportName = `${safePackId}-${sliceName}-sim-matrix-report.json`;
  const corpus = buildSimMatrixCorpusEvidence(
    {
      golden: GOLDEN_EVAL_PATH,
      matrixExtra: MATRIX_EXTRA_PATH,
      matrixWechat: wechatStaging ? wechatStaging : MATRIX_WECHAT_PATH,
      matrixNegative: MATRIX_NEGATIVE_PATH,
    },
    matrixSlice,
  );
  if (results.length !== corpus.row_hashes.length) {
    throw new Error(
      `评测结果行数与 corpus 不一致：results=${results.length} corpus=${corpus.row_hashes.length}`,
    );
  }
  const attestedResults = results.map((result, index) => ({
    ...result,
    row_hash: corpus.row_hashes[index]!.hash,
  }));

  const report: Record<string, unknown> = {
    at: new Date().toISOString(),
    pack: packId,
    deployment_id: deps.settings.deployment_id,
    active_domain: activeDomainId(deps.settings),
    settings_fingerprint: buildSimMatrixEvidenceFingerprint({
      deployment_id: deps.settings.deployment_id,
      active_domain: activeDomainId(deps.settings),
      llm_provider: deps.settings.llm_provider,
      llm_base_url: process.env.LLM_BASE_URL ?? deps.settings.llm_base_url,
      model: deps.model,
      llm_thinking: envBool("LLM_THINKING") ?? deps.settings.llm_thinking,
      domainConfig: activeDomainConfig(deps.settings),
    }),
    llm: "real",
    model: deps.model,
    escalation: true,
    escalation_count: escalatedCount,
    escalation_rate: results.length ? escalatedCount / results.length : 0,
    latency: latencyStats(results),
    slice: matrixSlice,
    eval_corpus_rows: corpus.rows,
    eval_corpus_digest: corpus.digest,
    eval_corpus_row_hashes: corpus.row_hashes,
    total: allStats.total,
    passed: allStats.passed,
    failed: allStats.total - allStats.passed,
    pass_rate: allStats.rate,
    slices: {
      core: {
        total: coreStats.total,
        passed: coreStats.passed,
        pass_rate: coreStats.rate,
        min_pass_rate: CORE_MIN_PASS,
      },
      wechat: {
        total: wechatStats.total,
        passed: wechatStats.passed,
        pass_rate: wechatStats.rate,
        min_pass_rate: WECHAT_MIN_PASS,
      },
      negative: {
        total: negativeStats.total,
        passed: negativeStats.passed,
        pass_rate: negativeStats.rate,
        min_pass_rate: NEGATIVE_MIN_PASS,
      },
    },
    failures: failures.slice(0, 40),
    results: attestedResults,
  };
  const evidenceSecret = process.env.EVAL_EVIDENCE_SECRET?.trim();
  if (evidenceSecret) {
    report.evidence_attestation = signSimMatrixReportEvidence(report, evidenceSecret);
  } else {
    console.warn(
      "[sim-matrix] EVAL_EVIDENCE_SECRET 未配置，报告不会被 readiness 接受为交付 evidence。",
    );
  }

  const reportText = `${JSON.stringify(report, null, 2)}\n`;
  const localReportPath = writeLocalEvalReport(reportName, reportText);
  const runtimeReportPath = writeRuntimeEvalEvidence({
    deploymentId: deps.settings.deployment_id,
    reportName,
    reportText,
  });

  console.log(
    `Sim matrix: core ${coreStats.passed}/${coreStats.total} (${(coreStats.rate * 100).toFixed(1)}%) | wechat ${wechatStats.passed}/${wechatStats.total} (${(wechatStats.rate * 100).toFixed(1)}%) | negative ${negativeStats.passed}/${negativeStats.total} (${(negativeStats.rate * 100).toFixed(1)}%)`,
  );
  if (failures.length) {
    console.log("Failures (first 15):");
    failures.slice(0, 15).forEach((f) => console.log(" -", f));
  }
  console.log(`Local report: ${localReportPath}`);
  console.log(`Runtime report: ${runtimeReportPath}`);

  const coreFail = matrixSlice === "core" && coreStats.rate < CORE_MIN_PASS;
  const wechatFail = matrixSlice === "wechat" && wechatStats.rate < WECHAT_MIN_PASS;
  const negativeFail = matrixSlice === "negative" && negativeStats.rate < NEGATIVE_MIN_PASS;
  if (coreFail || wechatFail || negativeFail) process.exit(1);
}

main();
