import { existsSync, readFileSync } from "node:fs";
import type {
  DomainPackContract,
  DomainPackCore,
  DomainPackEvalEvidence,
  DomainPackReadiness,
  DomainPackReadinessIssue,
} from "@embodied-agent/core";
import { assertRequiredServicesForPack } from "./services.js";
import type { PlatformRuntimeContext } from "./context.js";
import { isPlainObject, issue, pushIf } from "./readiness-utils.js";

type EvalSource = "golden" | "matrix_extra" | "matrix_wechat" | "matrix_negative";

type EvalValidation = {
  rows: number;
  validRows: number;
  invalidRows: number;
  expectedSkills: Set<string>;
  expectedSkillsWithAssertions: Set<string>;
  issues: DomainPackReadinessIssue[];
};

function validateJsonlRows(
  path: string,
  source: EvalSource,
  allowedSkills: ReadonlySet<string>,
): EvalValidation {
  const result: EvalValidation = {
    rows: 0,
    validRows: 0,
    invalidRows: 0,
    expectedSkills: new Set<string>(),
    expectedSkillsWithAssertions: new Set<string>(),
    issues: [],
  };
  if (!existsSync(path)) {
    result.issues.push(issue(`eval_${source}_missing`, `${path} 不存在。`));
    return result;
  }

  const lines = readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  result.rows = lines.length;

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (e) {
      result.invalidRows += 1;
      result.issues.push(
        issue(
          `eval_${source}_json_invalid`,
          `${path}:${lineNumber} JSON 无法解析：${e instanceof Error ? e.message : String(e)}`,
        ),
      );
      continue;
    }
    if (!isPlainObject(parsed)) {
      result.invalidRows += 1;
      result.issues.push(issue(`eval_${source}_row_invalid`, `${path}:${lineNumber} 必须是对象。`));
      continue;
    }
    const utterance = parsed.utterance;
    const expectedSkill = parsed.expected_skill;
    if (typeof utterance !== "string" || !utterance.trim()) {
      result.invalidRows += 1;
      result.issues.push(
        issue(`eval_${source}_utterance_missing`, `${path}:${lineNumber} 缺少 utterance。`),
      );
      continue;
    }
    if (typeof expectedSkill !== "string" || !expectedSkill.trim()) {
      result.invalidRows += 1;
      result.issues.push(
        issue(
          `eval_${source}_expected_skill_missing`,
          `${path}:${lineNumber} 缺少 expected_skill。`,
        ),
      );
      continue;
    }
    if (expectedSkill !== "clarification_needed" && !allowedSkills.has(expectedSkill)) {
      result.invalidRows += 1;
      result.issues.push(
        issue(
          `eval_${source}_expected_skill_unknown`,
          `${path}:${lineNumber} expected_skill ${expectedSkill} 不属于当前 Domain Pack。`,
        ),
      );
      continue;
    }
    if ("expected" in parsed && parsed.expected !== undefined && !isPlainObject(parsed.expected)) {
      result.invalidRows += 1;
      result.issues.push(
        issue(`eval_${source}_expected_invalid`, `${path}:${lineNumber} expected 必须是对象。`),
      );
      continue;
    }
    result.validRows += 1;
    result.expectedSkills.add(expectedSkill);
    if ("expected" in parsed) result.expectedSkillsWithAssertions.add(expectedSkill);
  }

  return result;
}

function collectDuplicateSkills(core: DomainPackCore): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const skill of [...core.skills.p0, ...core.skills.p1]) {
    if (seen.has(skill)) dupes.add(skill);
    seen.add(skill);
  }
  return [...dupes].sort();
}

function schemaSkillLiteral(schema: unknown): string | null {
  if (!schema || typeof schema !== "object") return null;
  const def = (schema as { _def?: unknown })._def;
  if (!def || typeof def !== "object") return null;
  const typeName = (def as { typeName?: unknown }).typeName;
  if (typeName !== "ZodObject") return null;
  const shapeFactory = (def as { shape?: unknown }).shape;
  const shape =
    typeof shapeFactory === "function"
      ? (shapeFactory as () => Record<string, unknown>)()
      : shapeFactory;
  if (!shape || typeof shape !== "object") return null;
  const skill = (shape as Record<string, unknown>).skill;
  if (!skill || typeof skill !== "object") return null;
  const skillDef = (skill as { _def?: unknown })._def;
  if (!skillDef || typeof skillDef !== "object") return null;
  const literalDef = skillDef as { typeName?: unknown; value?: unknown };
  return literalDef.typeName === "ZodLiteral" && typeof literalDef.value === "string"
    ? literalDef.value
    : null;
}

function collectSchemaSkillLiterals(core: DomainPackCore): string[] {
  return core.intentSchemas
    .map(schemaSkillLiteral)
    .filter((skill): skill is string => Boolean(skill));
}

export function evaluateDomainPackReadinessFromContract(
  ctx: PlatformRuntimeContext,
  contract: DomainPackContract,
): DomainPackReadiness {
  const readiness = evaluateDomainPackCoreReadiness(contract.core);
  const serviceIssues = assertRequiredServicesForPack(
    ctx.services,
    contract,
    contract.core.manifest.id,
  );
  if (serviceIssues.length === 0) return readiness;
  const issues = [...readiness.issues, ...serviceIssues];
  const hasBlockingIssue = issues.some((issue) => issue.severity === "error");
  const nextReadiness =
    contract.core.manifest.status === "placeholder"
      ? "placeholder"
      : hasBlockingIssue
        ? "blocked"
        : "ready";
  return {
    ...readiness,
    readiness: nextReadiness,
    deliverable: nextReadiness === "ready",
    issues,
  };
}

function evaluateDomainPackCoreReadiness(core: DomainPackCore): DomainPackReadiness {
  const allSkills = [...core.skills.p0, ...core.skills.p1];
  const allowedSkills = new Set(allSkills);
  const golden = validateJsonlRows(core.eval.golden, "golden", allowedSkills);
  const matrixExtra = validateJsonlRows(core.eval.matrixExtra, "matrix_extra", allowedSkills);
  const matrixWechat = validateJsonlRows(core.eval.matrixWechat, "matrix_wechat", allowedSkills);
  const matrixNegative = validateJsonlRows(
    core.eval.matrixNegative,
    "matrix_negative",
    allowedSkills,
  );
  const coveredSkills = new Set<string>();
  const coveredSkillsWithAssertions = new Set<string>();
  for (const validation of [golden, matrixExtra, matrixWechat]) {
    for (const skill of validation.expectedSkills) {
      if (skill !== "clarification_needed") coveredSkills.add(skill);
    }
    for (const skill of validation.expectedSkillsWithAssertions) {
      if (skill !== "clarification_needed") coveredSkillsWithAssertions.add(skill);
    }
  }
  const requiredCoverage = new Set([...core.skills.p0, ...core.skills.physical]);
  const missingRequiredSkills = [...requiredCoverage]
    .filter((skill) =>
      core.skills.physical.includes(skill)
        ? !coveredSkillsWithAssertions.has(skill)
        : !coveredSkills.has(skill),
    )
    .sort();
  const evalEvidence: DomainPackEvalEvidence = {
    golden_rows: golden.rows,
    matrix_extra_rows: matrixExtra.rows,
    matrix_wechat_rows: matrixWechat.rows,
    matrix_negative_rows: matrixNegative.rows,
    valid_rows:
      golden.validRows + matrixExtra.validRows + matrixWechat.validRows + matrixNegative.validRows,
    invalid_rows:
      golden.invalidRows +
      matrixExtra.invalidRows +
      matrixWechat.invalidRows +
      matrixNegative.invalidRows,
    covered_skills: [...coveredSkills].sort(),
    missing_required_skills: missingRequiredSkills,
  };
  const issues: DomainPackReadinessIssue[] = [
    ...golden.issues,
    ...matrixExtra.issues,
    ...matrixWechat.issues,
    ...matrixNegative.issues,
  ];
  const duplicateSkills = collectDuplicateSkills(core);
  const schemaSkills = collectSchemaSkillLiterals(core);
  const schemaSkillSet = new Set(schemaSkills);
  const missingSchemaSkills = allSkills.filter((skill) => !schemaSkillSet.has(skill)).sort();
  const extraSchemaSkills = schemaSkills.filter((skill) => !allowedSkills.has(skill)).sort();

  if (core.manifest.status === "placeholder") {
    issues.push({
      code: "placeholder_pack",
      message: "placeholder Domain Pack 只允许占位展示，不能作为可交付场景。",
      severity: "warning",
    });
  }

  pushIf(issues, evalEvidence.golden_rows === 0, "eval_golden_empty", "golden eval 为空。");
  pushIf(
    issues,
    evalEvidence.matrix_extra_rows === 0,
    "eval_matrix_extra_empty",
    "matrix extra eval 为空。",
  );
  pushIf(
    issues,
    evalEvidence.matrix_wechat_rows === 0,
    "eval_matrix_wechat_empty",
    "wechat matrix eval 为空。",
  );
  pushIf(
    issues,
    core.manifest.status === "live" && evalEvidence.matrix_negative_rows === 0,
    "eval_matrix_negative_empty",
    "negative matrix eval 为空。",
  );
  pushIf(
    issues,
    evalEvidence.invalid_rows !== undefined && evalEvidence.invalid_rows > 0,
    "eval_jsonl_invalid",
    "eval JSONL 存在非法行。",
  );
  pushIf(
    issues,
    core.manifest.status === "live" && missingRequiredSkills.length > 0,
    "eval_skill_coverage_missing",
    `eval 缺少 P0/physical skill 覆盖：${missingRequiredSkills.join(", ")}`,
  );
  pushIf(issues, allSkills.length === 0, "skills_empty", "Domain Pack 未声明 P0/P1 skill。");
  pushIf(
    issues,
    core.manifest.status === "live" && missingSchemaSkills.length > 0,
    "intent_schema_skill_missing",
    `intent schema 缺少 skill literal 覆盖：${missingSchemaSkills.join(", ")}`,
  );
  pushIf(
    issues,
    core.manifest.status === "live" && extraSchemaSkills.length > 0,
    "intent_schema_skill_unknown",
    `intent schema 声明了未登记 skill：${extraSchemaSkills.join(", ")}`,
  );
  pushIf(
    issues,
    core.manifest.status === "live" && !core.readiness,
    "runtime_readiness_missing",
    "live Domain Pack 必须声明 runtimeReadiness，校验 deployment config、registry 与 transport。",
  );
  pushIf(
    issues,
    core.manifest.status === "live" && !core.readiness?.flywheelGate?.adapterModule.trim(),
    "flywheel_gate_missing",
    "live Domain Pack 必须声明 runtimeReadiness.flywheelGate.adapterModule，供通用 flywheel gate 调度。",
  );
  pushIf(
    issues,
    core.skills.physical.length > 0 &&
      !core.commandAdapter?.commandBuilder &&
      !core.commandAdapter?.physicalExecutor,
    "physical_execution_missing",
    "物理技能缺少 commandBuilder 或 physicalExecutor。",
  );
  pushIf(
    issues,
    core.skills.physical.some((skill) => !allSkills.includes(skill)),
    "physical_skill_not_declared",
    "physical skill 必须同时属于 P0/P1 skill 集合。",
  );
  pushIf(
    issues,
    duplicateSkills.length > 0,
    "duplicate_skills",
    `Domain Pack 存在重复 skill：${duplicateSkills.join(", ")}`,
  );
  pushIf(
    issues,
    core.intentSchemas.length === 0,
    "intent_schemas_empty",
    "Domain Pack 未声明 intent schema。",
  );
  pushIf(
    issues,
    !core.prompt.section.trim(),
    "prompt_section_empty",
    "Domain Pack promptSection 为空。",
  );
  pushIf(
    issues,
    !core.prompt.contract.trim(),
    "intent_contract_empty",
    "Domain Pack intentContract 为空。",
  );
  pushIf(issues, !core.safety, "safety_missing", "Domain Pack 未声明 safety policy。");
  pushIf(
    issues,
    typeof core.targetResolver.isPhysicalControlSkill !== "function" ||
      typeof core.targetResolver.resolveDeviceTarget !== "function",
    "target_resolver_invalid",
    "Domain Pack targetResolver 不完整。",
  );
  pushIf(
    issues,
    typeof core.sceneRuntime.isSceneSkillId !== "function" ||
      typeof core.sceneRuntime.resolveSceneFromIntent !== "function" ||
      typeof core.sceneRuntime.riskLevelForPhysicalSkill !== "function",
    "scene_runtime_invalid",
    "Domain Pack sceneRuntime 不完整。",
  );

  const hasBlockingIssue = issues.some((issue) => issue.severity === "error");
  const readiness =
    core.manifest.status === "placeholder" ? "placeholder" : hasBlockingIssue ? "blocked" : "ready";

  return {
    pack_id: core.manifest.id,
    display_name: core.manifest.displayName,
    status: core.manifest.status,
    readiness,
    deliverable: readiness === "ready",
    eval: evalEvidence,
    issues,
  };
}
