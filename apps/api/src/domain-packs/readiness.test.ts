/**
 * Domain Pack readiness 集成测试。
 *
 * 注：apps/api/src/domain-packs/readiness shim 已删除，符号真源在 @embodied-agent/runtime。
 * 本文件测试 API loader + runtime readiness 的集成，不是 shim 单元测试。
 * 符号通过 @embodied-agent/runtime 直接导入。
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { DeviceRegistry, DomainPackEvalPaths } from "@embodied-agent/core";
import { buildCanonicalSimRegistry } from "@embodied-agent/domain-agriculture";
import {
  evaluateDomainPackReadinessFromContract,
  preloadAllDomainPacksForReadiness,
  resolveDomainPackContractById,
} from "./loader.js";
import {
  assertRequiredServices,
  assertRequiredServicesForPack,
  buildSimMatrixCorpusEvidence,
  buildSimMatrixEvidenceFingerprint,
  evaluateDomainPackRuntimeReadiness,
  evaluateSimMatrixReportEvidence,
  signSimMatrixReportEvidence,
} from "@embodied-agent/runtime";
import { syncActivePackBoundDomainServices } from "./services.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";

let ctx: ReturnType<typeof getPlatformRuntimeContext>;

beforeAll(async () => {
  ctx = getPlatformRuntimeContext();
  await preloadAllDomainPacksForReadiness(ctx.loader);
});

afterEach(() => {
  syncActivePackBoundDomainServices(ctx.services, process.env.ACTIVE_DOMAIN ?? "agriculture");
});

function robotRegistry(): DeviceRegistry {
  return {
    deployments: [
      {
        deployment_id: "dep-robot-dogfood-001",
        name: "Robot Dogfood",
        timezone: "Asia/Shanghai",
        status: "active",
      },
    ],
    entities: [
      {
        deployment_id: "dep-robot-dogfood-001",
        domain_id: "robotics",
        entity_type: "robot",
        entity_id: "m20-001",
        name: "M20",
        aliases: [],
        status: "active",
      },
    ],
    nodes: [
      {
        node_id: "node-m20-001",
        deployment_id: "dep-robot-dogfood-001",
        entity_id: "m20-001",
        status: "active",
      },
    ],
    devices: [
      {
        device_id: "m20-001",
        deployment_id: "dep-robot-dogfood-001",
        entity_id: "m20-001",
        device_type: "robot_dog",
        name: "M20",
        aliases: [],
        node_id: "node-m20-001",
        status: "active",
        transport: "m20_http",
      },
    ],
  };
}

function writeEvalPaths(dir: string): DomainPackEvalPaths {
  const paths = {
    golden: resolve(dir, "golden.jsonl"),
    matrixExtra: resolve(dir, "extra.jsonl"),
    matrixWechat: resolve(dir, "wechat.jsonl"),
    matrixNegative: resolve(dir, "negative.jsonl"),
  };
  writeFileSync(
    paths.golden,
    `${JSON.stringify({ utterance: "a", expected_skill: "status.query" })}\n`,
  );
  writeFileSync(
    paths.matrixExtra,
    `${JSON.stringify({ utterance: "b", expected_skill: "status.query" })}\n`,
  );
  writeFileSync(
    paths.matrixWechat,
    `${JSON.stringify({ utterance: "c", expected_skill: "status.query" })}\n`,
  );
  writeFileSync(
    paths.matrixNegative,
    `${JSON.stringify({ utterance: "d", expected_skill: "clarification_needed" })}\n`,
  );
  return paths;
}

function signedReport(opts: {
  evalPaths: DomainPackEvalPaths;
  slice: "core" | "wechat" | "negative";
  deploymentId?: string;
  activeDomain?: string;
  passRate?: number;
  passed?: number;
  failed?: number;
  results?: Array<Record<string, unknown>>;
  fingerprint?: string;
  secret?: string;
}) {
  const deploymentId = opts.deploymentId ?? "dep-test";
  const activeDomain = opts.activeDomain ?? "agriculture";
  const corpus = buildSimMatrixCorpusEvidence(opts.evalPaths, opts.slice);
  const results: Array<Record<string, unknown>> =
    opts.results ??
    (opts.slice === "core"
      ? [
          { id: 1, source: "golden", ok: true },
          { id: 2, source: "extra", ok: true },
        ]
      : [{ id: 1, source: opts.slice, ok: true }]);
  const attestedResults = results.map((result, index) => ({
    ...result,
    row_hash: corpus.row_hashes[index]!.hash,
  }));
  const passed = opts.passed ?? results.filter((row) => row.ok === true).length;
  const report: Record<string, unknown> = {
    at: new Date().toISOString(),
    pack: "agriculture",
    deployment_id: deploymentId,
    active_domain: activeDomain,
    settings_fingerprint:
      opts.fingerprint ??
      buildSimMatrixEvidenceFingerprint({
        deployment_id: deploymentId,
        active_domain: activeDomain,
        model: "test-model",
      }),
    llm: "real",
    slice: opts.slice,
    eval_corpus_rows: corpus.rows,
    eval_corpus_digest: corpus.digest,
    eval_corpus_row_hashes: corpus.row_hashes,
    total: corpus.rows,
    passed,
    failed: opts.failed ?? corpus.rows - passed,
    pass_rate: opts.passRate ?? (corpus.rows > 0 ? passed / corpus.rows : 0),
    results: attestedResults,
  };
  report.evidence_attestation = signSimMatrixReportEvidence(report, opts.secret ?? "test-secret");
  return report;
}

describe("domain pack readiness", () => {
  it("checks pack-bound services from registration catalog independent of active sync", () => {
    syncActivePackBoundDomainServices(ctx.services, "robotics");
    const agriculture = resolveDomainPackContractById(ctx.loader, "agriculture");
    expect(assertRequiredServicesForPack(ctx.services, agriculture, "agriculture")).toEqual([]);
    const readiness = evaluateDomainPackReadinessFromContract(ctx, agriculture);
    expect(readiness.issues.map((issue) => issue.code)).not.toContain("missing_required_service");
  });

  it("blocks runtime catalog when required services are not synced into active catalog", () => {
    syncActivePackBoundDomainServices(ctx.services, "robotics");
    const agriculture = resolveDomainPackContractById(ctx.loader, "agriculture");
    expect(assertRequiredServices(ctx.services, agriculture).map((issue) => issue.code)).toContain(
      "missing_required_service",
    );
  });

  it("marks complete live packs as deliverable", () => {
    syncActivePackBoundDomainServices(ctx.services, "agriculture");
    const readiness = evaluateDomainPackReadinessFromContract(
      ctx,
      resolveDomainPackContractById(ctx.loader, "agriculture"),
    );
    expect(readiness.readiness).toBe("ready");
    expect(readiness.deliverable).toBe(true);
    expect(readiness.eval.golden_rows).toBeGreaterThan(0);
    expect(readiness.eval.matrix_negative_rows).toBeGreaterThan(0);
    expect(readiness.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("keeps placeholder packs blocked from delivery", () => {
    const readiness = evaluateDomainPackReadinessFromContract(
      ctx,
      resolveDomainPackContractById(ctx.loader, "aquaculture"),
    );
    expect(readiness.readiness).toBe("placeholder");
    expect(readiness.deliverable).toBe(false);
    expect(readiness.issues.map((issue) => issue.code)).toContain("placeholder_pack");
    expect(readiness.issues.map((issue) => issue.code)).toContain("eval_golden_empty");
  });

  it("detects duplicated skills", () => {
    const contract = resolveDomainPackContractById(ctx.loader, "robotics");
    const readiness = evaluateDomainPackReadinessFromContract(ctx, {
      ...contract,
      core: {
        ...contract.core,
        skills: {
          ...contract.core.skills,
          p0: ["robot.query_status", "robot.query_status"],
        },
      },
    });
    expect(readiness.deliverable).toBe(false);
    expect(readiness.issues.map((issue) => issue.code)).toContain("duplicate_skills");
  });

  it("detects live pack skills missing from intent schemas", () => {
    const contract = resolveDomainPackContractById(ctx.loader, "robotics");
    const readiness = evaluateDomainPackReadinessFromContract(ctx, {
      ...contract,
      core: {
        ...contract.core,
        intentSchemas: contract.core.intentSchemas.filter(
          (schema) =>
            !schema.safeParse({ skill: "robot.move", target: {}, parameters: {} }).success,
        ),
      },
    });
    expect(readiness.deliverable).toBe(false);
    expect(readiness.issues.map((issue) => issue.code)).toContain("intent_schema_skill_missing");
  });

  it("blocks greenhouse runtime readiness when required MQTT is not connected", async () => {
    const runtime = await evaluateDomainPackRuntimeReadiness({
      contract: resolveDomainPackContractById(ctx.loader, "agriculture"),
      deployment_id: "dep-gh-pilot-001",
      registry: buildCanonicalSimRegistry(),
      mqttConnected: null,
    });
    expect(runtime.ready).toBe(false);
    expect(runtime.checks.find((check) => check.id === "mqtt_transport")?.ok).toBe(false);
  });

  it("blocks robot runtime readiness when the bound node is not online", async () => {
    const contract = resolveDomainPackContractById(ctx.loader, "robotics");
    const runtime = await evaluateDomainPackRuntimeReadiness({
      contract: {
        ...contract,
        core: {
          ...contract.core,
          readiness: contract.core.readiness
            ? { ...contract.core.readiness, probe: undefined }
            : undefined,
        },
      },
      deployment_id: "dep-robot-dogfood-001",
      domainConfig: {
        m20_base_url: "http://127.0.0.1:18080",
        default_robot_id: "m20-001",
      },
      registry: robotRegistry(),
      onlineNodeIds: [],
    });
    expect(runtime.ready).toBe(false);
    expect(runtime.issues.map((issue) => issue.code)).toContain("robot_node_offline");
  });

  it("blocks robot runtime readiness when the active node belongs to another deployment", async () => {
    const contract = resolveDomainPackContractById(ctx.loader, "robotics");
    const registry = robotRegistry();
    registry.nodes = registry.nodes?.map((node) => ({
      ...node,
      deployment_id: "dep-other",
    }));
    const runtime = await evaluateDomainPackRuntimeReadiness({
      contract: {
        ...contract,
        core: {
          ...contract.core,
          readiness: contract.core.readiness
            ? { ...contract.core.readiness, probe: undefined }
            : undefined,
        },
      },
      deployment_id: "dep-robot-dogfood-001",
      domainConfig: {
        m20_base_url: "http://127.0.0.1:18080",
        default_robot_id: "m20-001",
      },
      registry,
      onlineNodeIds: ["node-m20-001"],
    });
    expect(runtime.ready).toBe(false);
    expect(runtime.issues.map((issue) => issue.code)).toContain("robot_node_missing");
  });

  it("requires fresh real LLM sim matrix reports per slice", () => {
    const previousDataDir = process.env.AGENT_DATA_DIR;
    const dataDir = mkdtempSync(resolve(tmpdir(), "agent-readiness-"));
    const evalPaths = writeEvalPaths(dataDir);
    const reportDir = resolve(dataDir, "deployments", "dep-test", "eval-reports");
    const fingerprint = buildSimMatrixEvidenceFingerprint({
      deployment_id: "dep-test",
      active_domain: "agriculture",
      llm_provider: "deepseek",
      llm_base_url: "https://api.deepseek.com/v1",
      model: "test-model",
      llm_thinking: true,
      domainConfig: undefined,
    });
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(
      resolve(reportDir, "agriculture-core-sim-matrix-report.json"),
      `${JSON.stringify(signedReport({ evalPaths, slice: "core", fingerprint }))}\n`,
    );
    process.env.AGENT_DATA_DIR = dataDir;
    try {
      const reports = evaluateSimMatrixReportEvidence({
        packId: "agriculture",
        deploymentId: "dep-test",
        activeDomain: "agriculture",
        llmProvider: "deepseek",
        llmBaseUrl: "https://api.deepseek.com/v1",
        model: "test-model",
        llmThinking: true,
        evalPaths,
        evidenceSecret: "test-secret",
      });
      expect(reports.find((report) => report.slice === "core")?.ok).toBe(true);
      expect(reports.find((report) => report.slice === "wechat")?.ok).toBe(false);
      expect(reports.find((report) => report.slice === "negative")?.ok).toBe(false);
    } finally {
      if (previousDataDir === undefined) {
        delete process.env.AGENT_DATA_DIR;
      } else {
        process.env.AGENT_DATA_DIR = previousDataDir;
      }
    }
  });

  it("rejects sim matrix reports from another deployment", () => {
    const previousDataDir = process.env.AGENT_DATA_DIR;
    const dataDir = mkdtempSync(resolve(tmpdir(), "agent-readiness-"));
    const evalPaths = writeEvalPaths(dataDir);
    const reportDir = resolve(dataDir, "deployments", "dep-test", "eval-reports");
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(
      resolve(reportDir, "agriculture-core-sim-matrix-report.json"),
      `${JSON.stringify(
        signedReport({
          evalPaths,
          slice: "core",
          deploymentId: "dep-other",
          fingerprint: "wrong",
        }),
      )}\n`,
    );
    process.env.AGENT_DATA_DIR = dataDir;
    try {
      const reports = evaluateSimMatrixReportEvidence({
        packId: "agriculture",
        deploymentId: "dep-test",
        activeDomain: "agriculture",
        model: "test-model",
        evalPaths,
        evidenceSecret: "test-secret",
      });
      expect(reports.find((report) => report.slice === "core")?.ok).toBe(false);
    } finally {
      if (previousDataDir === undefined) {
        delete process.env.AGENT_DATA_DIR;
      } else {
        process.env.AGENT_DATA_DIR = previousDataDir;
      }
    }
  });

  it("rejects sim matrix reports with forged pass_rate", () => {
    const previousDataDir = process.env.AGENT_DATA_DIR;
    const dataDir = mkdtempSync(resolve(tmpdir(), "agent-readiness-"));
    const evalPaths = writeEvalPaths(dataDir);
    const reportDir = resolve(dataDir, "deployments", "dep-test", "eval-reports");
    const fingerprint = buildSimMatrixEvidenceFingerprint({
      deployment_id: "dep-test",
      active_domain: "agriculture",
      model: "test-model",
    });
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(
      resolve(reportDir, "agriculture-core-sim-matrix-report.json"),
      `${JSON.stringify(
        signedReport({
          evalPaths,
          slice: "core",
          fingerprint,
          passed: 1,
          failed: 1,
          passRate: 1,
          results: [
            { id: 1, source: "golden", ok: true },
            { id: 2, source: "extra", ok: false },
          ],
        }),
      )}\n`,
    );
    process.env.AGENT_DATA_DIR = dataDir;
    try {
      const reports = evaluateSimMatrixReportEvidence({
        packId: "agriculture",
        deploymentId: "dep-test",
        activeDomain: "agriculture",
        model: "test-model",
        evalPaths,
        evidenceSecret: "test-secret",
      });
      const core = reports.find((report) => report.slice === "core");
      expect(core?.ok).toBe(false);
      expect(core?.detail).toContain("computed=0.5");
    } finally {
      if (previousDataDir === undefined) {
        delete process.env.AGENT_DATA_DIR;
      } else {
        process.env.AGENT_DATA_DIR = previousDataDir;
      }
    }
  });

  it("rejects sim matrix reports with mismatched row hashes", () => {
    const previousDataDir = process.env.AGENT_DATA_DIR;
    const dataDir = mkdtempSync(resolve(tmpdir(), "agent-readiness-"));
    const evalPaths = writeEvalPaths(dataDir);
    const reportDir = resolve(dataDir, "deployments", "dep-test", "eval-reports");
    mkdirSync(reportDir, { recursive: true });
    const report = signedReport({ evalPaths, slice: "core" });
    const rows = report.results as Array<Record<string, unknown>>;
    rows[0] = { ...rows[0], row_hash: "bad" };
    report.evidence_attestation = signSimMatrixReportEvidence(report, "test-secret");
    writeFileSync(
      resolve(reportDir, "agriculture-core-sim-matrix-report.json"),
      `${JSON.stringify(report)}\n`,
    );
    process.env.AGENT_DATA_DIR = dataDir;
    try {
      const reports = evaluateSimMatrixReportEvidence({
        packId: "agriculture",
        deploymentId: "dep-test",
        activeDomain: "agriculture",
        model: "test-model",
        evalPaths,
        evidenceSecret: "test-secret",
      });
      const core = reports.find((item) => item.slice === "core");
      expect(core?.ok).toBe(false);
      expect(core?.detail).toContain("row_hash mismatch");
    } finally {
      if (previousDataDir === undefined) {
        delete process.env.AGENT_DATA_DIR;
      } else {
        process.env.AGENT_DATA_DIR = previousDataDir;
      }
    }
  });
});
