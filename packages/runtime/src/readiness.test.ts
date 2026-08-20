import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type {
  DeviceRegistry,
  DomainPackContract,
  DomainPackCore,
  DomainPackEvalPaths,
  DomainPackReadiness,
  DomainPackRuntimeReadiness,
} from "@embodied-agent/core";
import {
  buildSimMatrixCorpusEvidence,
  buildSimMatrixEvidenceFingerprint,
  collectDomainPackTransportIssues,
  evaluateDomainPackReadinessFromContract,
  evaluateDomainPackRuntimeReadiness,
  evaluateSimMatrixReportEvidence,
  signFlywheelAttestation,
  signSimMatrixReportEvidence,
  verifyFlywheelAttestation,
} from "./readiness.js";
import { createPlatformServiceHolder } from "./services.js";
import { createDomainPackLoaderHolder } from "./loader.js";
import type { PlatformRuntimeContext } from "./context.js";

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "readiness-test-"));
  tempDirs.push(dir);
  return dir;
}

type EvalLines = {
  golden?: string[];
  extra?: string[];
  wechat?: string[];
  negative?: string[];
};

const VALID_EVAL_LINES: Required<EvalLines> = {
  golden: ['{"utterance":"开排风","expected_skill":"device.start","expected":{}}'],
  extra: ['{"utterance":"查一下设备状态","expected_skill":"device.query"}'],
  wechat: ['{"utterance":"微信里开排风","expected_skill":"device.start","expected":{}}'],
  negative: ['{"utterance":"讲个笑话","expected_skill":"clarification_needed"}'],
};

function writeEvalFiles(lines: EvalLines = {}): DomainPackEvalPaths {
  const dir = makeTempDir();
  const merged = { ...VALID_EVAL_LINES, ...lines };
  const paths: DomainPackEvalPaths = {
    golden: join(dir, "golden.jsonl"),
    matrixExtra: join(dir, "extra.jsonl"),
    matrixWechat: join(dir, "wechat.jsonl"),
    matrixNegative: join(dir, "negative.jsonl"),
  };
  writeFileSync(paths.golden, merged.golden.join("\n") + "\n");
  writeFileSync(paths.matrixExtra, merged.extra.join("\n") + "\n");
  writeFileSync(paths.matrixWechat, merged.wechat.join("\n") + "\n");
  writeFileSync(paths.matrixNegative, merged.negative.join("\n") + "\n");
  return paths;
}

function skillSchema(skill: string): z.ZodTypeAny {
  return z.object({
    skill: z.literal(skill),
    params: z.object({}).optional(),
  });
}

const DEFAULT_READINESS: DomainPackRuntimeReadiness = {
  flywheelGate: {
    adapterModule: "test-adapter",
    description: "测试 flywheel gate",
  },
};

type FakeCoreOptions = {
  status?: "live" | "placeholder";
  intentSchemas?: readonly z.ZodTypeAny[];
  /** null 表示不声明 runtimeReadiness */
  readiness?: DomainPackRuntimeReadiness | null;
};

function fakeCore(evalPaths: DomainPackEvalPaths, opts: FakeCoreOptions = {}): DomainPackCore {
  const status = opts.status ?? "live";
  const sceneRuntime = {
    sceneSkillIds: ["device.start"],
    isSceneSkillId: (id: string) => id === "device.start",
    resolveSceneForTrigger: () => null,
    resolveSceneFromIntent: () => null,
    evaluateOutcomeSuccess: () => true,
    sceneSuccessMetric: () => "completion" as const,
    riskLevelForScene: () => "L1" as const,
    riskLevelForPhysicalSkill: () => "L2" as const,
    outcomeThresholdsForScene: () => ({}),
  };

  return {
    manifest: {
      id: "test",
      displayName: "Test",
      status,
      eval: evalPaths,
    },
    skills: {
      p0: ["device.start"],
      p1: ["device.query"],
      physical: ["device.start"],
    },
    intentSchemas: opts.intentSchemas ?? [skillSchema("device.start"), skillSchema("device.query")],
    prompt: {
      section: "prompt",
      contract: "contract",
    },
    eval: evalPaths,
    structuralOverrides: {},
    targetResolver: {
      isPhysicalControlSkill: () => true,
      resolveDeviceTarget: () => ({ ok: false, reason: "test" }),
    },
    commandAdapter: {
      commandBuilder: {
        buildCommandPatch: () => ({ action: "start" }),
      },
      commandReplies: {},
    },
    safety: {
      confirmDurationThresholdSeconds: 600,
      authorization: {
        controlSkills: ["device.start"],
        workerAllowedSkills: [],
        readonlyAllowedSkills: [],
      },
    },
    readiness: opts.readiness === null ? undefined : (opts.readiness ?? DEFAULT_READINESS),
    sceneRuntime,
    context: {
      buildDeploymentContext: () => ({ scene_context_sections: [] }),
    },
  };
}

function fakeContract(core: DomainPackCore): DomainPackContract {
  return {
    core,
    capabilities: [{ kind: "evidence", eval: core.eval, readiness: core.readiness }],
  };
}

function makeCtx(): PlatformRuntimeContext {
  const services = createPlatformServiceHolder();
  services.configure({});
  return { services, loader: createDomainPackLoaderHolder() };
}

function issueCodes(readiness: DomainPackReadiness): string[] {
  return readiness.issues.map((item) => item.code);
}

const EMPTY_REGISTRY: DeviceRegistry = { deployments: [], entities: [], devices: [] };

describe("evaluateDomainPackReadinessFromContract：JSONL eval 校验 + core readiness", () => {
  it("eval 全合法时 readiness 为 ready 且行数统计正确", () => {
    const result = evaluateDomainPackReadinessFromContract(
      makeCtx(),
      fakeContract(fakeCore(writeEvalFiles())),
    );

    expect(result.readiness).toBe("ready");
    expect(result.deliverable).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.eval.golden_rows).toBe(1);
    expect(result.eval.matrix_extra_rows).toBe(1);
    expect(result.eval.matrix_wechat_rows).toBe(1);
    expect(result.eval.matrix_negative_rows).toBe(1);
    expect(result.eval.valid_rows).toBe(4);
    expect(result.eval.invalid_rows).toBe(0);
    expect(result.eval.covered_skills).toEqual(["device.query", "device.start"]);
  });

  it("golden 含坏 JSON 行时报 eval_golden_json_invalid 且 blocked", () => {
    const evalPaths = writeEvalFiles({
      golden: [...VALID_EVAL_LINES.golden, "{not-json"],
    });
    const result = evaluateDomainPackReadinessFromContract(
      makeCtx(),
      fakeContract(fakeCore(evalPaths)),
    );

    expect(issueCodes(result)).toContain("eval_golden_json_invalid");
    expect(issueCodes(result)).toContain("eval_jsonl_invalid");
    expect(result.readiness).toBe("blocked");
    expect(result.deliverable).toBe(false);
    expect(result.eval.invalid_rows).toBe(1);
  });

  it("golden 出现未知 expected_skill 时报 eval_golden_expected_skill_unknown", () => {
    const evalPaths = writeEvalFiles({
      golden: [
        ...VALID_EVAL_LINES.golden,
        '{"utterance":"未知技能","expected_skill":"device.unknown"}',
      ],
    });
    const result = evaluateDomainPackReadinessFromContract(
      makeCtx(),
      fakeContract(fakeCore(evalPaths)),
    );

    expect(issueCodes(result)).toContain("eval_golden_expected_skill_unknown");
    expect(result.readiness).toBe("blocked");
  });

  it("physical skill 没有带 expected 断言的行时报 eval_skill_coverage_missing", () => {
    const evalPaths = writeEvalFiles({
      golden: ['{"utterance":"开排风","expected_skill":"device.start"}'],
      wechat: ['{"utterance":"微信查状态","expected_skill":"device.query"}'],
    });
    const result = evaluateDomainPackReadinessFromContract(
      makeCtx(),
      fakeContract(fakeCore(evalPaths)),
    );

    expect(issueCodes(result)).toContain("eval_skill_coverage_missing");
    expect(result.eval.missing_required_skills).toEqual(["device.start"]);
    expect(result.readiness).toBe("blocked");
  });

  it("placeholder pack 的 readiness 为 placeholder 并带 placeholder_pack warning", () => {
    const result = evaluateDomainPackReadinessFromContract(
      makeCtx(),
      fakeContract(fakeCore(writeEvalFiles(), { status: "placeholder" })),
    );

    expect(result.readiness).toBe("placeholder");
    expect(result.deliverable).toBe(false);
    const placeholder = result.issues.find((item) => item.code === "placeholder_pack");
    expect(placeholder?.severity).toBe("warning");
  });
});

describe("intent schema skill literal 检查", () => {
  it("schema 覆盖全部 p0+p1 skill 时无 intent_schema_skill_missing", () => {
    const result = evaluateDomainPackReadinessFromContract(
      makeCtx(),
      fakeContract(fakeCore(writeEvalFiles())),
    );

    expect(issueCodes(result)).not.toContain("intent_schema_skill_missing");
    expect(issueCodes(result)).not.toContain("intent_schema_skill_unknown");
  });

  it("缺一个 skill 的 schema 时报 intent_schema_skill_missing", () => {
    const result = evaluateDomainPackReadinessFromContract(
      makeCtx(),
      fakeContract(fakeCore(writeEvalFiles(), { intentSchemas: [skillSchema("device.start")] })),
    );

    const missing = result.issues.find((item) => item.code === "intent_schema_skill_missing");
    expect(missing?.message).toContain("device.query");
    expect(result.readiness).toBe("blocked");
  });

  it("schema 声明未登记 skill 时报 intent_schema_skill_unknown", () => {
    const result = evaluateDomainPackReadinessFromContract(
      makeCtx(),
      fakeContract(
        fakeCore(writeEvalFiles(), {
          intentSchemas: [
            skillSchema("device.start"),
            skillSchema("device.query"),
            skillSchema("device.unknown"),
          ],
        }),
      ),
    );

    const unknown = result.issues.find((item) => item.code === "intent_schema_skill_unknown");
    expect(unknown?.message).toContain("device.unknown");
    expect(result.readiness).toBe("blocked");
  });
});

describe("collectDomainPackTransportIssues", () => {
  function transportContract(): DomainPackContract {
    return fakeContract(
      fakeCore(writeEvalFiles(), {
        readiness: { ...DEFAULT_READINESS, requiredTransports: ["mqtt"] },
      }),
    );
  }

  it("required transport 未提供连接态时报 unknown_required_transport", () => {
    const issues = collectDomainPackTransportIssues(transportContract(), {});
    expect(issues.map((item) => item.code)).toEqual(["unknown_required_transport"]);
  });

  it("连接态为 false 或 null 时报 {transport}_transport_unavailable", () => {
    for (const state of [false, null]) {
      const issues = collectDomainPackTransportIssues(transportContract(), { mqtt: state });
      expect(issues.map((item) => item.code)).toEqual(["mqtt_transport_unavailable"]);
    }
  });

  it("连接态为 true 时无 issue", () => {
    expect(collectDomainPackTransportIssues(transportContract(), { mqtt: true })).toEqual([]);
  });

  it("pack 未声明 readiness 时返回空数组", () => {
    const contract = fakeContract(fakeCore(writeEvalFiles(), { readiness: null }));
    expect(collectDomainPackTransportIssues(contract, {})).toEqual([]);
  });
});

describe("evaluateDomainPackRuntimeReadiness", () => {
  it("无 readiness 时 ready 为 false 且 checks 含 runtime_readiness error", async () => {
    const result = await evaluateDomainPackRuntimeReadiness({
      contract: fakeContract(fakeCore(writeEvalFiles(), { readiness: null })),
      deployment_id: "dep-1",
      registry: EMPTY_REGISTRY,
    });

    expect(result.ready).toBe(false);
    expect(result.issues.map((item) => item.code)).toContain("runtime_readiness_missing");
    const check = result.checks.find((item) => item.id === "runtime_readiness");
    expect(check?.ok).toBe(false);
    expect(check?.severity).toBe("error");
  });

  it("validateConfig 返回 error issue 时 domain_config check 不 ok", async () => {
    const result = await evaluateDomainPackRuntimeReadiness({
      contract: fakeContract(
        fakeCore(writeEvalFiles(), {
          readiness: {
            ...DEFAULT_READINESS,
            validateConfig: () => [
              { code: "domain_config_invalid", message: "缺少必需配置。", severity: "error" },
            ],
          },
        }),
      ),
      deployment_id: "dep-1",
      registry: EMPTY_REGISTRY,
    });

    expect(result.ready).toBe(false);
    const check = result.checks.find((item) => item.id === "domain_config");
    expect(check?.ok).toBe(false);
    expect(check?.detail).toBe("缺少必需配置。");
  });

  it("mqttConnected 为 true 时 mqtt transport 不再报 unavailable", async () => {
    const result = await evaluateDomainPackRuntimeReadiness({
      contract: fakeContract(
        fakeCore(writeEvalFiles(), {
          readiness: { ...DEFAULT_READINESS, requiredTransports: ["mqtt"] },
        }),
      ),
      deployment_id: "dep-1",
      registry: EMPTY_REGISTRY,
      mqttConnected: true,
    });

    expect(result.issues.map((item) => item.code)).not.toContain("mqtt_transport_unavailable");
    expect(result.ready).toBe(true);
  });
});

describe("HMAC 证据签名", () => {
  const SECRET = "test-secret";

  it("signFlywheelAttestation / verifyFlywheelAttestation 往返成功", () => {
    const row: Record<string, unknown> = { scene: "vent", ok: true, at: "2026-07-03T00:00:00Z" };
    row.attestation = signFlywheelAttestation(row, SECRET);
    expect(verifyFlywheelAttestation(row, SECRET)).toBe(true);
  });

  it("篡改 row 字段后 verify 为 false", () => {
    const row: Record<string, unknown> = { scene: "vent", ok: true, at: "2026-07-03T00:00:00Z" };
    row.attestation = signFlywheelAttestation(row, SECRET);
    row.ok = false;
    expect(verifyFlywheelAttestation(row, SECRET)).toBe(false);
  });

  it("attestation 非 64 位 hex 时 verify 为 false", () => {
    const row: Record<string, unknown> = { scene: "vent", attestation: "not-a-hex-attestation" };
    expect(verifyFlywheelAttestation(row, SECRET)).toBe(false);
  });

  it("buildSimMatrixEvidenceFingerprint 对 key 乱序的 domainConfig 产出相同指纹", () => {
    const base = {
      deployment_id: "dep-1",
      active_domain: "agriculture",
      model: "test-model",
    };
    const a = buildSimMatrixEvidenceFingerprint({
      ...base,
      domainConfig: { alpha: 1, nested: { x: 1, y: 2 } },
    });
    const b = buildSimMatrixEvidenceFingerprint({
      ...base,
      domainConfig: { nested: { y: 2, x: 1 }, alpha: 1 },
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("evaluateSimMatrixReportEvidence", () => {
  const SECRET = "evidence-secret";
  const DEPLOYMENT_ID = "dep-1";
  const ACTIVE_DOMAIN = "agriculture";
  const MODEL = "test-model";
  let previousAgentDataDir: string | undefined;

  beforeEach(() => {
    previousAgentDataDir = process.env.AGENT_DATA_DIR;
  });

  afterEach(() => {
    if (previousAgentDataDir === undefined) {
      delete process.env.AGENT_DATA_DIR;
    } else {
      process.env.AGENT_DATA_DIR = previousAgentDataDir;
    }
  });

  function evaluateOpts(evalPaths: DomainPackEvalPaths) {
    return {
      packId: "test",
      deploymentId: DEPLOYMENT_ID,
      activeDomain: ACTIVE_DOMAIN,
      evalPaths,
      model: MODEL,
      evidenceSecret: SECRET,
    };
  }

  function writeCoreReport(
    dataDir: string,
    evalPaths: DomainPackEvalPaths,
    options: { failFirstRow?: boolean } = {},
  ): void {
    const corpus = buildSimMatrixCorpusEvidence(evalPaths, "core");
    const results = corpus.row_hashes.map((row, index) => ({
      source: row.source,
      ok: options.failFirstRow ? index > 0 : true,
      row_hash: row.hash,
    }));
    const passed = results.filter((row) => row.ok).length;
    const report: Record<string, unknown> = {
      pack: "test",
      slice: "core",
      deployment_id: DEPLOYMENT_ID,
      active_domain: ACTIVE_DOMAIN,
      settings_fingerprint: buildSimMatrixEvidenceFingerprint({
        deployment_id: DEPLOYMENT_ID,
        active_domain: ACTIVE_DOMAIN,
        model: MODEL,
      }),
      llm: "real",
      at: new Date().toISOString(),
      total: corpus.rows,
      passed,
      failed: corpus.rows - passed,
      pass_rate: corpus.rows > 0 ? passed / corpus.rows : 0,
      eval_corpus_digest: corpus.digest,
      eval_corpus_rows: corpus.rows,
      eval_corpus_row_hashes: corpus.row_hashes,
      results,
    };
    report.evidence_attestation = signSimMatrixReportEvidence(report, SECRET);
    const reportDir = resolve(dataDir, "deployments", DEPLOYMENT_ID, "eval-reports");
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(resolve(reportDir, "test-core-sim-matrix-report.json"), JSON.stringify(report));
  }

  it("报告缺失时三个 slice 全部 ok:false 且 path:null", () => {
    process.env.AGENT_DATA_DIR = makeTempDir();
    const slices = evaluateSimMatrixReportEvidence(evaluateOpts(writeEvalFiles()));

    expect(slices.map((item) => item.slice)).toEqual(["core", "wechat", "negative"]);
    for (const slice of slices) {
      expect(slice.ok).toBe(false);
      expect(slice.path).toBeNull();
    }
  });

  it("完整签名报告的 core slice 为 ok:true", () => {
    const dataDir = makeTempDir();
    process.env.AGENT_DATA_DIR = dataDir;
    const evalPaths = writeEvalFiles();
    writeCoreReport(dataDir, evalPaths);

    const [core] = evaluateSimMatrixReportEvidence(evaluateOpts(evalPaths));
    expect(core!.ok).toBe(true);
    expect(core!.fresh).toBe(true);
    expect(core!.pass_rate).toBe(1);
    expect(core!.min_pass_rate).toBe(0.9);
    expect(core!.total).toBe(2);
  });

  it("pass_rate 低于 core 最低门槛 0.9 时 ok:false", () => {
    const dataDir = makeTempDir();
    process.env.AGENT_DATA_DIR = dataDir;
    const evalPaths = writeEvalFiles();
    writeCoreReport(dataDir, evalPaths, { failFirstRow: true });

    const [core] = evaluateSimMatrixReportEvidence(evaluateOpts(evalPaths));
    expect(core!.ok).toBe(false);
    expect(core!.pass_rate).toBe(0.5);
    expect(core!.min_pass_rate).toBe(0.9);
  });
});
