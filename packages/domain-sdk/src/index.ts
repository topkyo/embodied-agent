import type {
  DomainPackClarificationHandler,
  DomainPackCommandHooks,
  DomainPackCommandReplies,
  DomainPackContract,
  DomainPackConversation,
  DomainPackCore,
  DomainPackCapabilityKind,
  DomainPackDigest,
  DomainPackModeStore,
  DomainPackNlgConfig,
  DomainPackPolicySuggestions,
  DomainPackPreDispatchHandler,
  DomainPackProactiveAlerts,
  DomainPackRuntime,
  DomainPackManifest,
  BindNodeDeviceTemplate,
  DomainPackOpsSchema,
  DomainPackOpsSettingsField,
  OpsCapability,
  SkillDisplayMeta,
  DomainPackScheduledReports,
  DomainPackSkillHandler,
  DomainPackWeatherProactive,
  DomainPackWeeklyAdvice,
  IntentPayload,
  RiskLevel,
} from "@embodied-agent/core";

export { packRootFromModuleUrl, resolvePackEvalPaths } from "./pack-paths.js";
export { createFlywheelAdapter, type CreateFlywheelAdapterOptions } from "./flywheel-adapter.js";

export type SkillDefinition<TSkill extends string = string> = {
  skill: TSkill;
  priority?: "p0" | "p1";
  description?: string;
};

export type PhysicalSkillDefinition<TSkill extends string = string> = SkillDefinition<TSkill> & {
  priority?: "p0" | "p1";
  physical: true;
  display: SkillDisplayMeta;
};

export type OutcomeMetricDefinition<TMetric extends string = string> = {
  id: TMetric;
  label: string;
  unit?: string;
  successDirection?: "increase" | "decrease" | "boolean" | "completion";
};

export type DomainPackConformanceIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type DomainPackConformanceResult = {
  pack_id: string;
  status: "live" | "placeholder";
  deliverable: boolean;
  capability_kinds: readonly DomainPackCapabilityKind[];
  issues: readonly DomainPackConformanceIssue[];
};

export function defineDomainPackContract<TContract extends DomainPackContract>(
  contract: TContract,
): TContract {
  return contract;
}

export function defineDomainPackCore<TCore extends DomainPackCore>(core: TCore): TCore {
  return core;
}

export type DomainPackCapabilityAssembly = {
  satellite?: boolean;
  skillHandler?: DomainPackSkillHandler;
  commandReplies?: DomainPackCommandReplies;
  nlg?: DomainPackNlgConfig;
  clarification?: DomainPackClarificationHandler;
  preDispatch?: DomainPackPreDispatchHandler;
  conversation?: DomainPackConversation;
  modeStore?: DomainPackModeStore;
  proactiveAlerts?: DomainPackProactiveAlerts;
  scheduledReports?: DomainPackScheduledReports;
  policySuggestions?: DomainPackPolicySuggestions;
  commandHooks?: DomainPackCommandHooks;
  digest?: DomainPackDigest;
  weeklyAdvice?: DomainPackWeeklyAdvice;
  weatherProactive?: DomainPackWeatherProactive;
  resolveControlAction?: OpsCapability["resolveControlAction"];
  /** tab id → extension widget_id（写入 ops schema navigation.tabs） */
  opsTabWidgets?: Partial<Record<string, string>>;
  /** 追加到 ops schema settings.fields（pack 声明的 domain 配置项） */
  opsSettingsFields?: readonly DomainPackOpsSettingsField[];
  /** 写入 ops schema devices.binding.deviceTemplate（节点绑定预填设备模板） */
  opsDeviceTemplate?: readonly BindNodeDeviceTemplate[];
};

export function assembleDomainPackContract(
  core: DomainPackCore,
  extras: DomainPackCapabilityAssembly = {},
): DomainPackContract {
  const capabilities: DomainPackContract["capabilities"] = [
    { kind: "scene", runtime: core.sceneRuntime },
    {
      kind: "ops",
      schema: applyOpsTabWidgets(
        applyOpsSettingsFields(
          applyOpsDeviceTemplate(createDomainPackOpsSchema(core), extras.opsDeviceTemplate),
          extras.opsSettingsFields,
        ),
        extras.opsTabWidgets,
      ),
      ...(extras.resolveControlAction ? { resolveControlAction: extras.resolveControlAction } : {}),
    },
    { kind: "evidence", eval: core.eval, readiness: core.readiness },
    ...(extras.skillHandler
      ? [
          {
            kind: "skill-handler" as const,
            value: extras.skillHandler,
            requiredServices: extras.skillHandler.serviceKeys,
          },
        ]
      : []),
    ...(extras.commandReplies
      ? [{ kind: "command-replies" as const, value: extras.commandReplies }]
      : []),
    ...(extras.nlg ? [{ kind: "nlg" as const, config: extras.nlg }] : []),
    ...(extras.clarification
      ? [{ kind: "clarification" as const, value: extras.clarification }]
      : []),
    ...(extras.preDispatch ? [{ kind: "pre-dispatch" as const, value: extras.preDispatch }] : []),
    ...(extras.conversation ? [{ kind: "conversation" as const, value: extras.conversation }] : []),
    ...(extras.modeStore ? [{ kind: "mode-store" as const, value: extras.modeStore }] : []),
    ...(extras.proactiveAlerts
      ? [{ kind: "proactive-alerts" as const, value: extras.proactiveAlerts }]
      : []),
    ...(extras.scheduledReports
      ? [{ kind: "scheduled-reports" as const, value: extras.scheduledReports }]
      : []),
    ...(extras.policySuggestions
      ? [{ kind: "policy-suggestions" as const, value: extras.policySuggestions }]
      : []),
    ...(extras.commandHooks
      ? [{ kind: "command-hooks" as const, value: extras.commandHooks }]
      : []),
    ...(extras.digest ? [{ kind: "digest" as const, value: extras.digest }] : []),
    ...(extras.weeklyAdvice
      ? [{ kind: "weekly-advice" as const, value: extras.weeklyAdvice }]
      : []),
    ...(extras.weatherProactive
      ? [{ kind: "weather-proactive" as const, value: extras.weatherProactive }]
      : []),
    ...(extras.satellite ? [{ kind: "satellite" as const }] : []),
  ];
  return defineDomainPackContract({ core, capabilities });
}

export function definePhysicalSkill<const TSkill extends string>(
  definition: Omit<PhysicalSkillDefinition<TSkill>, "physical">,
): PhysicalSkillDefinition<TSkill> {
  return { ...definition, physical: true };
}

function applyOpsSettingsFields(
  schema: DomainPackOpsSchema,
  fields: DomainPackCapabilityAssembly["opsSettingsFields"],
): DomainPackOpsSchema {
  if (!fields?.length) return schema;
  return {
    ...schema,
    settings: {
      ...schema.settings,
      fields: [...schema.settings.fields, ...fields],
    },
  };
}

function applyOpsTabWidgets(
  schema: DomainPackOpsSchema,
  widgets: DomainPackCapabilityAssembly["opsTabWidgets"],
): DomainPackOpsSchema {
  if (!widgets || Object.keys(widgets).length === 0) return schema;
  return {
    ...schema,
    navigation: {
      ...schema.navigation,
      tabs: schema.navigation.tabs.map((tab) => {
        const widget_id = widgets[tab.id];
        return widget_id ? { ...tab, widget_id } : tab;
      }),
    },
  };
}

function applyOpsDeviceTemplate(
  schema: DomainPackOpsSchema,
  template: DomainPackCapabilityAssembly["opsDeviceTemplate"],
): DomainPackOpsSchema {
  if (!template?.length) return schema;
  return {
    ...schema,
    devices: {
      ...schema.devices,
      binding: { ...schema.devices.binding, deviceTemplate: template },
    },
  };
}

/** 平台 settings 层直接管理的 transport（自动生成 `{transport}_url` 字段）。其余如 m20_http 走 domainConfig + probe。 */
const PLATFORM_SETTINGS_TRANSPORTS = new Set(["mqtt"]);

export function createDomainPackOpsSchema(core: DomainPackCore): DomainPackOpsSchema {
  const requiredTransports = core.readiness?.requiredTransports ?? [];
  const requiredNodes = core.readiness?.flywheel?.requiredNodes ?? [];
  return {
    schema_version: 1,
    pack_id: core.manifest.id,
    display_name: core.manifest.displayName,
    status: core.manifest.status,
    navigation: {
      tabs: [
        { id: "overview", label: "Overview", route: "", kind: "overview", enabled: true },
        {
          id: "control",
          label: "Control",
          route: "control",
          kind: "control",
          enabled: Boolean(core.commandAdapter?.physicalExecutor),
          installer_only: true,
          reason: core.commandAdapter?.physicalExecutor
            ? undefined
            : "manual_control_widget_not_declared",
        },
        {
          id: "settings",
          label: "Scene settings",
          route: "settings",
          kind: "settings",
          enabled: true,
        },
        { id: "devices", label: "Devices", route: "devices", kind: "devices", enabled: true },
        { id: "users", label: "Users", route: "users", kind: "users", enabled: true },
        {
          id: "review",
          label: "Review",
          route: "review",
          kind: "review",
          enabled: true,
          installer_only: false,
        },
        {
          id: "platform",
          label: "Platform base",
          route: "platform",
          kind: "platform",
          enabled: true,
          installer_only: true,
        },
      ],
    },
    settings: {
      fields: [
        {
          id: "deployment_id",
          label: "Deployment ID",
          scope: "platform",
          type: "string",
          control: "text",
          save_target: "settings",
          required: true,
        },
        {
          id: "active_domain",
          label: "Active Domain Pack",
          scope: "platform",
          type: "string",
          control: "text",
          save_target: "settings",
          required: true,
        },
        {
          id: "llm_api_key",
          label: "LLM API Key",
          scope: "platform",
          type: "secret",
          control: "password",
          save_target: "env_required",
          required: true,
          secret: true,
        },
        ...requiredTransports
          .filter((transport) => PLATFORM_SETTINGS_TRANSPORTS.has(transport))
          .map((transport) => ({
            id: `${transport}_url`,
            label: `${transport.toUpperCase()} URL`,
            scope: "platform" as const,
            type: "string" as const,
            control: "text" as const,
            save_target: "settings" as const,
            required: true,
          })),
      ],
    },
    devices: {
      binding: {
        required_transports: requiredTransports,
        physical_skills: core.skills.physical,
        required_nodes: requiredNodes,
      },
    },
    control: {
      actions: core.skills.physical.map((skill) => {
        const skillDef = core.skills.physicalDefinitions?.find((def) => def.skill === skill);
        return {
          id: skill,
          label: skill,
          skill,
          physical: true,
          requires_confirmation: !["L0", "L1"].includes(
            core.sceneRuntime.riskLevelForPhysicalSkill(skill),
          ),
          ...(skillDef?.display ? { display: skillDef.display } : {}),
        };
      }),
    },
    eval_evidence: {
      slices: [
        { id: "golden", label: "Golden", path: core.eval.golden, required: true },
        { id: "matrix_extra", label: "Matrix Extra", path: core.eval.matrixExtra, required: true },
        {
          id: "matrix_wechat",
          label: "Matrix WeChat",
          path: core.eval.matrixWechat,
          required: true,
        },
        {
          id: "matrix_negative",
          label: "Matrix Negative",
          path: core.eval.matrixNegative,
          required: true,
        },
      ],
    },
  };
}

export function createPlaceholderSceneRuntime(_skillPrefix: string): DomainPackRuntime {
  return {
    sceneSkillIds: [],
    isSceneSkillId: () => false,
    resolveSceneForTrigger: () => null,
    resolveSceneFromIntent: () => null,
    evaluateOutcomeSuccess: () => false,
    sceneSuccessMetric: () => "completion",
    riskLevelForScene: () => undefined,
    riskLevelForPhysicalSkill: (_skill: string, opts?: { requires_confirmation?: boolean }) =>
      opts?.requires_confirmation ? "L2" : "L1",
    outcomeThresholdsForScene: () => ({}),
  };
}

export function createPlaceholderTargetResolver() {
  return {
    isPhysicalControlSkill: (_intent: IntentPayload) => false,
    resolveDeviceTarget: () => ({
      ok: false as const,
      reason: "placeholder Domain Pack 未声明可执行设备目标。",
    }),
  };
}

function issue(
  code: string,
  message: string,
  severity: DomainPackConformanceIssue["severity"] = "error",
): DomainPackConformanceIssue {
  return { code, message, severity };
}

function contractCapabilityKindsFor(contract: DomainPackContract): DomainPackCapabilityKind[] {
  return contract.capabilities.map((capability) => capability.kind);
}

function isDomainPackOpsSchema(value: unknown): value is DomainPackOpsSchema {
  if (!value || typeof value !== "object") return false;
  const schema = value as Partial<DomainPackOpsSchema>;
  const navigation = schema.navigation;
  const settings = schema.settings;
  const binding = schema.devices?.binding;
  const control = schema.control;
  const evalEvidence = schema.eval_evidence;
  return (
    schema.schema_version === 1 &&
    typeof schema.pack_id === "string" &&
    Boolean(navigation) &&
    Array.isArray(navigation?.tabs) &&
    Boolean(settings) &&
    Array.isArray(settings?.fields) &&
    Boolean(binding) &&
    Array.isArray(binding?.required_transports) &&
    Array.isArray(binding?.physical_skills) &&
    Array.isArray(binding?.required_nodes) &&
    Boolean(control) &&
    Array.isArray(control?.actions) &&
    Boolean(evalEvidence) &&
    Array.isArray(evalEvidence?.slices)
  );
}

function evaluateContractConformance(contract: DomainPackContract): DomainPackConformanceIssue[] {
  const issues: DomainPackConformanceIssue[] = [];
  const ops = contract.capabilities.find((capability) => capability.kind === "ops");
  if (!isDomainPackOpsSchema(ops?.schema)) {
    issues.push(issue("ops_schema_invalid", "ops capability 必须声明完整 DomainPackOpsSchema。"));
    return issues;
  }
  if (ops.schema.pack_id !== contract.core.manifest.id) {
    issues.push(issue("ops_schema_pack_id_mismatch", "ops schema pack_id 必须匹配 manifest.id。"));
  }
  return issues;
}

const RISK_LEVEL_RANK: Record<RiskLevel, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 };
const CONFORMANCE_INVALID_SCENE_ID = "__not_a_scene__";

function riskLevelRank(level: unknown): number | undefined {
  return typeof level === "string" ? RISK_LEVEL_RANK[level as RiskLevel] : undefined;
}

/**
 * sceneRuntime 九件套行为级不变量（防 pack 手抄漂移）：
 * - sceneSkillIds 非空、无重复，且与 isSceneSkillId 同构；
 * - 每个场景必须声明非空 success metric、定义的风险等级与阈值对象；
 * - outcome 失败可见：非 completion metric 缺遥测不得判成功；failed 状态一律不得判成功；
 * - 未知 trigger 必须解析为 null；requires_confirmation 的物理技能风险至少 L2。
 */
function evaluateSceneRuntimeConformance(core: DomainPackCore): DomainPackConformanceIssue[] {
  const issues: DomainPackConformanceIssue[] = [];
  const runtime = core.sceneRuntime;
  if (
    !Array.isArray(runtime.sceneSkillIds) ||
    typeof runtime.isSceneSkillId !== "function" ||
    typeof runtime.resolveSceneForTrigger !== "function" ||
    typeof runtime.resolveSceneFromIntent !== "function" ||
    typeof runtime.evaluateOutcomeSuccess !== "function" ||
    typeof runtime.sceneSuccessMetric !== "function" ||
    typeof runtime.riskLevelForScene !== "function" ||
    typeof runtime.riskLevelForPhysicalSkill !== "function" ||
    typeof runtime.outcomeThresholdsForScene !== "function"
  ) {
    issues.push(
      issue("scene_runtime_incomplete", "sceneRuntime 九件套不完整，无法执行行为级检查。"),
    );
    return issues;
  }
  const ids = runtime.sceneSkillIds;
  if (ids.length === 0) {
    issues.push(issue("scene_skill_ids_empty", "sceneRuntime.sceneSkillIds 不能为空。"));
  }
  if (new Set(ids).size !== ids.length) {
    issues.push(issue("scene_skill_ids_duplicate", "sceneRuntime.sceneSkillIds 存在重复项。"));
  }
  if (runtime.isSceneSkillId(CONFORMANCE_INVALID_SCENE_ID) !== false) {
    issues.push(
      issue(
        "scene_skill_id_accepts_invalid",
        `isSceneSkillId 必须对非法 id（"${CONFORMANCE_INVALID_SCENE_ID}"）返回 false。`,
      ),
    );
  }
  if (runtime.resolveSceneForTrigger({ type: "__unknown_trigger__" }) !== null) {
    issues.push(
      issue(
        "scene_trigger_unknown_not_null",
        "resolveSceneForTrigger 对未知 trigger 必须返回 null。",
      ),
    );
  }
  for (const id of ids) {
    if (runtime.isSceneSkillId(id) !== true) {
      issues.push(
        issue("scene_skill_id_not_recognized", `isSceneSkillId("${id}") 必须返回 true。`),
      );
      continue;
    }
    const metric = runtime.sceneSuccessMetric(id);
    if (typeof metric !== "string" || !metric.trim()) {
      issues.push(
        issue("scene_success_metric_empty", `sceneSuccessMetric("${id}") 必须返回非空字符串。`),
      );
    }
    if (riskLevelRank(runtime.riskLevelForScene(id)) === undefined) {
      issues.push(
        issue("scene_risk_level_undefined", `riskLevelForScene("${id}") 必须返回定义的风险等级。`),
      );
    }
    const thresholds = runtime.outcomeThresholdsForScene(id);
    if (!thresholds || typeof thresholds !== "object") {
      issues.push(
        issue(
          "scene_outcome_thresholds_invalid",
          `outcomeThresholdsForScene("${id}") 必须返回对象。`,
        ),
      );
    }
    // completion 语义下 command_status=completed 即成功、缺遥测判 true 是合法的，仅对其余 metric 断言。
    if (metric !== "completion") {
      const missingTelemetrySuccess = runtime.evaluateOutcomeSuccess({
        scene_skill_id: id,
        command_status: "completed",
        window_minutes: 10,
      });
      if (missingTelemetrySuccess) {
        issues.push(
          issue(
            "scene_outcome_missing_telemetry_success",
            `evaluateOutcomeSuccess("${id}") 在缺失遥测（无 before/after）时不得判定成功，失败必须可见。`,
          ),
        );
      }
    }
    const failedStatusSuccess = runtime.evaluateOutcomeSuccess({
      scene_skill_id: id,
      command_status: "failed",
      before: { entity_id: "__conformance__", temperature_c: 30, humidity_percent: 80 },
      after: {
        entity_id: "__conformance__",
        temperature_c: 20,
        humidity_percent: 60,
        evidence_count: 1,
        anomaly_count: 0,
        repeated_anomaly_waypoints: [],
      },
      window_minutes: 10,
    });
    if (failedStatusSuccess) {
      issues.push(
        issue(
          "scene_outcome_failed_status_success",
          `evaluateOutcomeSuccess("${id}") 在 command_status="failed" 时不得判定成功。`,
        ),
      );
    }
  }
  for (const skill of core.skills.physical) {
    const rank = riskLevelRank(
      runtime.riskLevelForPhysicalSkill(skill, { requires_confirmation: true }),
    );
    if (rank === undefined || rank < RISK_LEVEL_RANK.L2) {
      issues.push(
        issue(
          "scene_physical_skill_confirmation_risk_too_low",
          `riskLevelForPhysicalSkill("${skill}", { requires_confirmation: true }) 必须返回 L2 或更高。`,
        ),
      );
    }
  }
  return issues;
}

function sameEvalPaths(a: DomainPackCore["eval"], b: DomainPackCore["eval"]): boolean {
  return (
    a.golden === b.golden &&
    a.matrixExtra === b.matrixExtra &&
    a.matrixWechat === b.matrixWechat &&
    a.matrixNegative === b.matrixNegative
  );
}

function evaluateChannelOnboardingConformance(
  manifest: DomainPackManifest,
): DomainPackConformanceIssue[] {
  const issues: DomainPackConformanceIssue[] = [];
  const onboarding = manifest.channelOnboarding;

  if (!onboarding) {
    if (manifest.status === "live") {
      issues.push(
        issue(
          "channel_onboarding_missing",
          "live Domain Pack 必须声明 channelOnboarding.examples（1–4 条非空字符串）。",
        ),
      );
    }
    return issues;
  }

  const { examples } = onboarding;
  if (!Array.isArray(examples)) {
    issues.push(
      issue(
        "channel_onboarding_examples_invalid",
        "channelOnboarding.examples 必须是字符串数组。",
      ),
    );
    return issues;
  }

  if (examples.length < 1 || examples.length > 4) {
    issues.push(
      issue(
        "channel_onboarding_examples_count",
        "channelOnboarding.examples 长度必须在 1–4 之间。",
      ),
    );
  }

  for (let i = 0; i < examples.length; i++) {
    const item = examples[i];
    if (typeof item !== "string" || item.trim().length === 0) {
      issues.push(
        issue(
          "channel_onboarding_example_empty",
          `channelOnboarding.examples[${i}] 必须是非空字符串。`,
        ),
      );
    }
  }

  return issues;
}

function evaluateCoreConformance(
  core: DomainPackCore,
  capabilityKinds: readonly DomainPackCapabilityKind[],
): DomainPackConformanceIssue[] {
  const issues: DomainPackConformanceIssue[] = [];
  const allSkills = [...core.skills.p0, ...core.skills.p1];

  if (!core.manifest.id.trim()) {
    issues.push(issue("manifest_id_missing", "Domain Pack manifest.id 不能为空。"));
  }
  if (!core.manifest.displayName.trim()) {
    issues.push(issue("manifest_display_name_missing", "Domain Pack displayName 不能为空。"));
  }
  issues.push(...evaluateChannelOnboardingConformance(core.manifest));
  if (core.manifest.status === "placeholder") {
    issues.push(
      issue(
        "placeholder_pack",
        "placeholder Domain Pack 只允许占位展示，不能作为可交付场景。",
        "warning",
      ),
    );
  }
  if (!sameEvalPaths(core.manifest.eval, core.eval)) {
    issues.push(issue("eval_paths_mismatch", "manifest.eval 与 pack.eval 必须指向同一组路径。"));
  }
  if (allSkills.length === 0) {
    issues.push(issue("skills_empty", "Domain Pack 未声明 P0/P1 skill。"));
  }
  if (core.intentSchemas.length === 0) {
    issues.push(issue("intent_schemas_empty", "Domain Pack 未声明 intent schema。"));
  }
  if (!core.prompt.section.trim()) {
    issues.push(issue("prompt_section_empty", "Domain Pack promptSection 为空。"));
  }
  if (!core.prompt.contract.trim()) {
    issues.push(issue("intent_contract_empty", "Domain Pack intentContract 为空。"));
  }
  if (!core.safety) {
    issues.push(issue("safety_missing", "Domain Pack 未声明 safety policy。"));
  } else if (
    typeof core.safety.confirmDurationThresholdSeconds !== "number" ||
    core.safety.confirmDurationThresholdSeconds <= 0
  ) {
    issues.push(
      issue(
        "safety_confirm_threshold_missing",
        "Domain Pack safety policy 必须显式声明 confirmDurationThresholdSeconds。",
      ),
    );
  }
  if (!core.readiness && core.manifest.status === "live") {
    issues.push(issue("runtime_readiness_missing", "live Domain Pack 必须声明 runtimeReadiness。"));
  }
  if (
    typeof core.targetResolver.isPhysicalControlSkill !== "function" ||
    typeof core.targetResolver.resolveDeviceTarget !== "function"
  ) {
    issues.push(issue("target_resolver_invalid", "Domain Pack targetResolver 不完整。"));
  }
  if (
    typeof core.sceneRuntime.isSceneSkillId !== "function" ||
    typeof core.sceneRuntime.resolveSceneFromIntent !== "function" ||
    typeof core.sceneRuntime.riskLevelForPhysicalSkill !== "function"
  ) {
    issues.push(issue("scene_runtime_invalid", "Domain Pack sceneRuntime 不完整。"));
  }
  issues.push(...evaluateSceneRuntimeConformance(core));
  if (core.skills.physical.length > 0 && !core.commandAdapter) {
    issues.push(
      issue("physical_execution_missing", "物理技能缺少 commandBuilder 或 physicalExecutor。"),
    );
  }
  for (const capability of ["scene", "ops", "evidence"] as const) {
    if (!capabilityKinds.includes(capability)) {
      issues.push(
        issue(`${capability}_capability_missing`, `Domain Pack 未声明 ${capability} capability。`),
      );
    }
  }
  return issues;
}

export function evaluateDomainPackConformance(
  contract: DomainPackContract,
): DomainPackConformanceResult {
  const core = contract.core;
  const capability_kinds = contractCapabilityKindsFor(contract);
  const issues = evaluateCoreConformance(core, capability_kinds);
  issues.push(...evaluateContractConformance(contract));

  const hasError = issues.some((item) => item.severity === "error");
  return {
    pack_id: core.manifest.id,
    status: core.manifest.status,
    deliverable: core.manifest.status === "live" && !hasError,
    capability_kinds,
    issues,
  };
}

export function assertDomainPackConformance(
  contract: DomainPackContract,
): DomainPackConformanceResult {
  const result = evaluateDomainPackConformance(contract);
  if (result.status === "live" && !result.deliverable) {
    const details = result.issues.map((item) => `${item.code}: ${item.message}`).join("; ");
    throw new Error(`Domain Pack ${result.pack_id} conformance failed: ${details}`);
  }
  if (result.status === "placeholder" && result.deliverable) {
    throw new Error(`Domain Pack ${result.pack_id} placeholder must not be deliverable.`);
  }
  return result;
}
