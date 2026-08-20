import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DomainPackEvalPaths } from "@embodied-agent/core";
import { resolveAgentDataDir } from "@embodied-agent/platform";
import type {
  SimMatrixCorpusEvidence,
  SimMatrixCorpusSource,
  SimMatrixEvidenceFingerprintInput,
  SimMatrixReportEvidence,
  SimMatrixSlice,
} from "./readiness-evidence-types.js";
import { isPlainObject, numberField, readJson, stableJson } from "./readiness-utils.js";

const SIM_MATRIX_MIN_PASS_RATE: Record<SimMatrixSlice, number> = {
  core: 0.9,
  wechat: 1,
  negative: 1,
};

export function buildSimMatrixEvidenceFingerprint(
  input: SimMatrixEvidenceFingerprintInput,
): string {
  return createHash("sha256")
    .update(
      stableJson({
        deployment_id: input.deployment_id,
        active_domain: input.active_domain,
        llm_provider: input.llm_provider ?? null,
        llm_base_url: input.llm_base_url ?? null,
        model: input.model,
        llm_thinking: input.llm_thinking ?? null,
        domainConfig: input.domainConfig ?? null,
      }),
    )
    .digest("hex");
}

function evalCorpusPaths(evalPaths: DomainPackEvalPaths, slice: SimMatrixSlice): string[] {
  if (slice === "core") return [evalPaths.golden, evalPaths.matrixExtra];
  if (slice === "wechat") return [evalPaths.matrixWechat];
  return [evalPaths.matrixNegative];
}

export function buildSimMatrixCorpusEvidence(
  evalPaths: DomainPackEvalPaths,
  slice: SimMatrixSlice,
): SimMatrixCorpusEvidence {
  // sim-matrix evidence 属意图层离线评测：row_hash 基于 eval corpus 行内容生成，不映射 command_id；
  // per-command 执行证据由 scene-outcomes.jsonl + command-logs.jsonl 承担。
  const rows: Array<{ source: SimMatrixCorpusSource; row: unknown }> = [];
  for (const path of evalCorpusPaths(evalPaths, slice)) {
    const source =
      path === evalPaths.golden
        ? "golden"
        : path === evalPaths.matrixExtra
          ? "extra"
          : path === evalPaths.matrixWechat
            ? "wechat"
            : "negative";
    const lines = readFileSync(path, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      rows.push({ source, row: JSON.parse(line) });
    }
  }
  const rowHashes = rows.map((row) => ({
    source: row.source,
    hash: createHash("sha256").update(stableJson(row)).digest("hex"),
  }));
  return {
    rows: rows.length,
    digest: createHash("sha256").update(stableJson(rows)).digest("hex"),
    row_hashes: rowHashes,
  };
}

function reportForAttestation(report: Record<string, unknown>): Record<string, unknown> {
  const { evidence_attestation: _evidenceAttestation, ...unsigned } = report;
  return unsigned;
}

export function signSimMatrixReportEvidence(
  report: Record<string, unknown>,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(stableJson(reportForAttestation(report)))
    .digest("hex");
}

function attestationForSigning(row: Record<string, unknown>): Record<string, unknown> {
  const { attestation: _attestation, ...unsigned } = row;
  return unsigned;
}

export function signFlywheelAttestation(row: Record<string, unknown>, secret: string): string {
  return createHmac("sha256", secret)
    .update(stableJson(attestationForSigning(row)))
    .digest("hex");
}

export function verifyFlywheelAttestation(row: Record<string, unknown>, secret: string): boolean {
  const actual = typeof row.attestation === "string" ? row.attestation : "";
  if (!/^[a-f0-9]{64}$/i.test(actual)) return false;
  const expected = signFlywheelAttestation(row, secret);
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function verifySimMatrixReportEvidence(report: Record<string, unknown>, secret: string): boolean {
  const actual = typeof report.evidence_attestation === "string" ? report.evidence_attestation : "";
  if (!/^[a-f0-9]{64}$/i.test(actual)) return false;
  const expected = signSimMatrixReportEvidence(report, secret);
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function reportFresh(at: string | undefined, maxAgeHours: number): boolean {
  if (!at) return false;
  const ts = Date.parse(at);
  if (!Number.isFinite(ts)) return false;
  const ageMs = Date.now() - ts;
  return ageMs >= 0 && ageMs <= maxAgeHours * 60 * 60 * 1000;
}

function validateReportRows(
  parsed: Record<string, unknown>,
  slice: SimMatrixSlice,
  total: number,
  corpus: SimMatrixCorpusEvidence,
): { ok: boolean; passed?: number; passRate?: number; detail?: string } {
  const results = parsed.results;
  if (!Array.isArray(results)) return { ok: false, detail: "results 缺失" };
  if (results.length !== total) {
    return { ok: false, detail: `results.length=${results.length} total=${total}` };
  }
  const allowedSources = slice === "core" ? new Set(["golden", "extra"]) : new Set<string>([slice]);
  let passed = 0;
  for (const [index, row] of results.entries()) {
    if (!isPlainObject(row)) return { ok: false, detail: `results[${index}] 不是对象` };
    if (!allowedSources.has(String(row.source))) {
      return { ok: false, detail: `results[${index}] source=${String(row.source)}` };
    }
    if (row.ok === true) passed += 1;
    if (row.ok !== true && row.ok !== false) {
      return { ok: false, detail: `results[${index}] ok 非 boolean` };
    }
    const expectedHash = corpus.row_hashes[index];
    if (!expectedHash) {
      return { ok: false, detail: `results[${index}] 缺少对应 corpus row` };
    }
    if (row.row_hash !== expectedHash.hash) {
      return { ok: false, detail: `results[${index}] row_hash mismatch` };
    }
    if (row.source !== expectedHash.source) {
      return { ok: false, detail: `results[${index}] source 与 corpus 不一致` };
    }
  }
  const reportedPassed = numberField(parsed, "passed");
  const reportedFailed = numberField(parsed, "failed");
  if (reportedPassed !== passed || reportedFailed !== total - passed) {
    return {
      ok: false,
      detail: `passed/failed 不一致：reported=${reportedPassed}/${reportedFailed} actual=${passed}/${total - passed}`,
    };
  }
  return { ok: true, passed, passRate: total > 0 ? passed / total : 0 };
}

export function evaluateSimMatrixReportEvidence(opts: {
  packId: string;
  deploymentId: string;
  activeDomain: string;
  evalPaths: DomainPackEvalPaths;
  llmProvider?: string;
  llmBaseUrl?: string;
  model: string;
  llmThinking?: boolean;
  domainConfig?: unknown;
  evidenceSecret?: string;
  maxAgeHours?: number;
}): SimMatrixReportEvidence[] {
  // 这里只校验意图层离线 sim-matrix 报告；执行层 per-command 闭环仍由 command_id 串联的
  // scene-outcomes.jsonl + command-logs.jsonl 承担。
  const maxAgeHours = opts.maxAgeHours ?? 168;
  const dataRoot = process.env.AGENT_DATA_DIR?.trim() || resolveAgentDataDir();
  const expectedFingerprint = buildSimMatrixEvidenceFingerprint({
    deployment_id: opts.deploymentId,
    active_domain: opts.activeDomain,
    llm_provider: opts.llmProvider,
    llm_base_url: opts.llmBaseUrl,
    model: opts.model,
    llm_thinking: opts.llmThinking,
    domainConfig: opts.domainConfig,
  });
  const slices = ["core", "wechat", "negative"] as const;
  return slices.map((slice) => {
    const reportName = `${opts.packId}-${slice}-sim-matrix-report.json`;
    const path = resolve(dataRoot, "deployments", opts.deploymentId, "eval-reports", reportName);
    if (!existsSync(path)) {
      return {
        slice,
        path: null,
        ok: false,
        fresh: false,
        detail: `${reportName} 不存在于当前 deployment evidence 目录`,
      };
    }
    try {
      const parsed = readJson(path);
      if (!isPlainObject(parsed)) {
        return { slice, path, ok: false, fresh: false, detail: "报告不是 JSON object" };
      }
      const pack = parsed.pack;
      const actualSlice = parsed.slice;
      const deploymentId = parsed.deployment_id;
      const activeDomain = parsed.active_domain;
      const fingerprint = parsed.settings_fingerprint;
      const llm = parsed.llm;
      const at = typeof parsed.at === "string" ? parsed.at : undefined;
      const total = numberField(parsed, "total");
      const passRate = numberField(parsed, "pass_rate");
      const minPassRate = SIM_MATRIX_MIN_PASS_RATE[slice];
      const corpus = buildSimMatrixCorpusEvidence(opts.evalPaths, slice);
      const corpusDigest = parsed.eval_corpus_digest;
      const corpusRows = numberField(parsed, "eval_corpus_rows");
      const reportRowHashes = Array.isArray(parsed.eval_corpus_row_hashes)
        ? parsed.eval_corpus_row_hashes
        : [];
      const evidenceSecret = opts.evidenceSecret?.trim();
      const attested = evidenceSecret
        ? verifySimMatrixReportEvidence(parsed, evidenceSecret)
        : false;
      const fresh = reportFresh(at, maxAgeHours);
      const rowValidation =
        typeof total === "number"
          ? validateReportRows(parsed, slice, total, corpus)
          : { ok: false, detail: "total 缺失" };
      const computedPassRate = rowValidation.passRate;
      const ok =
        pack === opts.packId &&
        actualSlice === slice &&
        deploymentId === opts.deploymentId &&
        activeDomain === opts.activeDomain &&
        fingerprint === expectedFingerprint &&
        llm === "real" &&
        attested &&
        corpusDigest === corpus.digest &&
        corpusRows === corpus.rows &&
        stableJson(reportRowHashes) === stableJson(corpus.row_hashes) &&
        typeof total === "number" &&
        total === corpus.rows &&
        total > 0 &&
        typeof passRate === "number" &&
        typeof computedPassRate === "number" &&
        passRate === computedPassRate &&
        computedPassRate >= minPassRate &&
        fresh &&
        rowValidation.ok;
      const detail = ok
        ? `${path} pass_rate=${passRate.toFixed(3)}`
        : `${path} pack=${String(pack)} slice=${String(actualSlice)} deployment=${String(deploymentId)} active_domain=${String(activeDomain)} llm=${String(llm)} attested=${attested} pass_rate=${String(passRate)} computed=${String(computedPassRate)} min=${minPassRate} fresh=${fresh} corpus_rows=${String(corpusRows)}/${corpus.rows} corpus_digest=${String(corpusDigest) === corpus.digest ? "ok" : "mismatch"} rows=${rowValidation.detail ?? "ok"}`;
      return {
        slice,
        path,
        ok,
        fresh,
        at,
        pass_rate: passRate,
        min_pass_rate: minPassRate,
        total,
        detail,
      };
    } catch (e) {
      return {
        slice,
        path,
        ok: false,
        fresh: false,
        detail: `报告无法读取：${e instanceof Error ? e.message : String(e)}`,
      };
    }
  });
}
