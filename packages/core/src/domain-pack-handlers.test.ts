import { describe, expect, it } from "vitest";
import type { IntentPayload } from "./schemas/intent.js";
import type { DeviceRegistry, RegistryDevice } from "./registry.js";
import type {
  DomainPackRuntimeReadiness,
  DomainPackRuntimeReadinessContext,
  DomainPackTargetResolver,
  DomainPackPhysicalExecutor,
  DomainPackSkillHandler,
  DomainPackCommandReplies,
  DomainPackNlgConfig,
  DomainPackCommandBuilder,
  DomainPackClarificationHandler,
  DomainPackPreDispatchHandler,
  DomainPackSafetyPolicy,
  DomainPackSafetyContext,
  DomainPackIntentProcessing,
  DomainPackStructuralOverrides,
  DomainPackModeStore,
  DomainPackProactiveAlerts,
  DomainPackSustainedAlertInput,
  DomainPackScheduledReports,
  DomainPackScheduledReportSchedule,
  DomainPackPolicySuggestions,
  DomainPackCommandHooks,
  DomainPackDigest,
  DomainPackWeeklyAdvice,
  DomainPackWeeklyAdviceInput,
  DomainPackWeatherProactive,
  DomainPackWeatherAlert,
  DomainPackRuntime,
  DomainPackContext,
  DomainPackConversation,
} from "./domain-pack-handlers.js";
import type { CommandMessage } from "./schemas/command.js";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function makeIntent(skill: string): IntentPayload {
  return {
    skill,
    target: { entity_id: "entity-001" },
    parameters: {},
  };
}

function makeRegistry(): DeviceRegistry {
  return {
    deployments: [{ deployment_id: "dep-001", name: "Test", timezone: "UTC", status: "active" }],
    entities: [
      {
        entity_id: "entity-001",
        entity_type: "greenhouse",
        domain_id: "agriculture",
        deployment_id: "dep-001",
        name: "GH1",
        aliases: ["gh1"],
        status: "active",
      },
    ],
    devices: [
      {
        device_id: "device-001",
        deployment_id: "dep-001",
        entity_id: "entity-001",
        device_type: "vent",
        name: "Vent 1",
        aliases: ["v1"],
        node_id: "node-001",
        status: "active",
      } as RegistryDevice,
    ],
  };
}

function makeReadinessContext(): DomainPackRuntimeReadinessContext {
  return {
    deployment_id: "dep-001",
    registry: makeRegistry(),
  };
}

/* ------------------------------------------------------------------ */
/* DomainPackRuntimeReadiness                                          */
/* ------------------------------------------------------------------ */

describe("DomainPackRuntimeReadiness", () => {
  it("supports validateConfig returning issues", () => {
    const readiness: DomainPackRuntimeReadiness = {
      validateConfig: (_ctx) => [
        { code: "MISSING_KEY", message: "LLM key missing", severity: "error" },
      ],
    };
    const issues = readiness.validateConfig!(makeReadinessContext());
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("MISSING_KEY");
    expect(issues[0].severity).toBe("error");
  });

  it("supports validateRegistry returning empty issues", () => {
    const readiness: DomainPackRuntimeReadiness = {
      validateRegistry: () => [],
    };
    expect(readiness.validateRegistry!(makeReadinessContext())).toEqual([]);
  });

  it("supports probe returning readiness checks", async () => {
    const readiness: DomainPackRuntimeReadiness = {
      probe: () => [
        { id: "mqtt", ok: true, label: "MQTT", detail: "connected", severity: "error" },
      ],
    };
    const checks = await readiness.probe!(makeReadinessContext());
    expect(checks[0].ok).toBe(true);
    expect(checks[0].label).toBe("MQTT");
  });

  it("supports async probe", async () => {
    const readiness: DomainPackRuntimeReadiness = {
      probe: async () => [
        { id: "llm", ok: false, label: "LLM", detail: "no key", severity: "error" },
      ],
    };
    const checks = await readiness.probe!(makeReadinessContext());
    expect(checks[0].ok).toBe(false);
  });

  it("supports probeNotRequired", () => {
    const readiness: DomainPackRuntimeReadiness = {
      probeNotRequired: { reason: "sim only" },
    };
    expect(readiness.probeNotRequired?.reason).toBe("sim only");
  });

  it("supports requiredTransports", () => {
    const readiness: DomainPackRuntimeReadiness = {
      requiredTransports: ["mqtt"],
    };
    expect(readiness.requiredTransports).toContain("mqtt");
  });

  it("supports resolveFlywheel", () => {
    const readiness: DomainPackRuntimeReadiness = {
      resolveFlywheel: (_ctx) => ({
        requiredTelemetry: [{ entity_id: "entity-001", metric: "temperature_c" }],
        requiredNodes: ["node-001"],
      }),
    };
    const flywheel = readiness.resolveFlywheel?.(makeReadinessContext());
    expect(flywheel?.requiredTelemetry).toHaveLength(1);
    expect(flywheel?.requiredNodes).toContain("node-001");
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackTargetResolver                                            */
/* ------------------------------------------------------------------ */

describe("DomainPackTargetResolver", () => {
  it("isPhysicalControlSkill identifies physical skills", () => {
    const resolver: DomainPackTargetResolver = {
      isPhysicalControlSkill: (intent) => intent.skill === "device.start",
      resolveDeviceTarget: () => ({ ok: false, reason: "not found" }),
    };
    expect(resolver.isPhysicalControlSkill(makeIntent("device.start"))).toBe(true);
    expect(resolver.isPhysicalControlSkill(makeIntent("device.query_status"))).toBe(false);
  });

  it("resolveDeviceTarget returns ok with target", () => {
    const resolver: DomainPackTargetResolver = {
      isPhysicalControlSkill: () => true,
      resolveDeviceTarget: (_intent, registry, ctx) => ({
        ok: true,
        target: {
          deployment_id: ctx.deployment_id,
          node_id: "node-001",
          device: registry.devices[0],
        },
      }),
    };
    const result = resolver.resolveDeviceTarget(makeIntent("device.start"), makeRegistry(), {
      deployment_id: "dep-001",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.target.device.device_id).toBe("device-001");
    }
  });

  it("resolveDeviceTarget returns failure", () => {
    const resolver: DomainPackTargetResolver = {
      isPhysicalControlSkill: () => true,
      resolveDeviceTarget: () => ({
        ok: false,
        reason: "device not found",
      }),
    };
    const result = resolver.resolveDeviceTarget(makeIntent("device.start"), makeRegistry(), {
      deployment_id: "dep-001",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("device not found");
    }
  });

  it("supports optional preparePhysicalIntent", () => {
    const resolver: DomainPackTargetResolver = {
      isPhysicalControlSkill: () => true,
      resolveDeviceTarget: () => ({ ok: false, reason: "none" }),
      preparePhysicalIntent: (intent) => ({
        ...intent,
        parameters: { duration_seconds: 600 },
      }),
    };
    const result = resolver.preparePhysicalIntent?.(
      makeIntent("device.start"),
      {},
    ) as IntentPayload;
    expect(result.parameters).toEqual({ duration_seconds: 600 });
  });

  it("preparePhysicalIntent can return failure", () => {
    const resolver: DomainPackTargetResolver = {
      isPhysicalControlSkill: () => true,
      resolveDeviceTarget: () => ({ ok: false, reason: "none" }),
      preparePhysicalIntent: () => ({ ok: false, reason: "missing config" }),
    };
    const result = resolver.preparePhysicalIntent?.(makeIntent("device.start"), {});
    expect(result).toEqual({ ok: false, reason: "missing config" });
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackPhysicalExecutor                                          */
/* ------------------------------------------------------------------ */

describe("DomainPackPhysicalExecutor", () => {
  it("canExecuteTarget and execute", async () => {
    const device: RegistryDevice = {
      device_id: "device-001",
      deployment_id: "dep-001",
      device_type: "vent",
      name: "Vent",
      aliases: [],
      node_id: "node-001",
      status: "active",
    };
    const executor: DomainPackPhysicalExecutor = {
      canExecuteTarget: (target) => target.device.status === "active",
      execute: async (intent) => ({ skill: intent.skill, sent: true }),
    };
    expect(
      executor.canExecuteTarget({
        deployment_id: "dep-001",
        node_id: "node-001",
        device,
      }),
    ).toBe(true);
    expect(
      executor.canExecuteTarget({
        deployment_id: "dep-001",
        node_id: "node-001",
        device: { ...device, status: "offline" },
      }),
    ).toBe(false);

    const result = await executor.execute(
      makeIntent("device.start"),
      { deployment_id: "dep-001", node_id: "node-001", device },
      {},
    );
    expect(result).toEqual({ skill: "device.start", sent: true });
  });

  it("supports optional failureCode and logFields", () => {
    const executor: DomainPackPhysicalExecutor = {
      canExecuteTarget: () => true,
      execute: async () => null,
      failureCode: "DEVICE_OFFLINE",
      logFields: { transport: "mqtt" },
    };
    expect(executor.failureCode).toBe("DEVICE_OFFLINE");
    expect(executor.logFields).toEqual({ transport: "mqtt" });
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackSkillHandler                                              */
/* ------------------------------------------------------------------ */

describe("DomainPackSkillHandler", () => {
  it("canHandle and handle", async () => {
    const handler: DomainPackSkillHandler = {
      canHandle: (intent) => intent.skill === "device.query_status",
      handle: async (intent, ctx) => ({
        reply: `Status for ${intent.skill}`,
        params: { deploymentId: ctx.deploymentId },
      }),
    };
    expect(handler.canHandle(makeIntent("device.query_status"))).toBe(true);
    expect(handler.canHandle(makeIntent("device.start"))).toBe(false);

    const result = await handler.handle(makeIntent("device.query_status"), {
      deploymentId: "dep-001",
    });
    expect(result.reply).toBe("Status for device.query_status");
    expect(result.params.deploymentId).toBe("dep-001");
  });

  it("supports optional serviceKeys", () => {
    const handler: DomainPackSkillHandler = {
      serviceKeys: ["telemetry"],
      canHandle: () => true,
      handle: async () => ({ reply: "ok", params: {} }),
    };
    expect(handler.serviceKeys).toContain("telemetry");
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackCommandReplies                                            */
/* ------------------------------------------------------------------ */

describe("DomainPackCommandReplies", () => {
  it("physicalCommandSentReply returns reply text", () => {
    const replies: DomainPackCommandReplies = {
      physicalCommandSentReply: (skill) => `Command sent: ${skill}`,
    };
    expect(replies.physicalCommandSentReply?.("device.start")).toBe("Command sent: device.start");
  });

  it("physicalCommandSentReply can return undefined", () => {
    const replies: DomainPackCommandReplies = {
      physicalCommandSentReply: () => undefined,
    };
    expect(replies.physicalCommandSentReply?.("device.start")).toBeUndefined();
  });

  it("pendingSummary returns text", () => {
    const replies: DomainPackCommandReplies = {
      pendingSummary: (intent) => `Pending: ${intent.skill}`,
    };
    expect(replies.pendingSummary?.(makeIntent("device.start"))).toBe("Pending: device.start");
  });

  it("commandStatusMessage returns message from record", () => {
    const replies: DomainPackCommandReplies = {
      commandStatusMessage: (record) => (record as { status?: string }).status ?? null,
    };
    expect(replies.commandStatusMessage?.({ status: "completed" })).toBe("completed");
    expect(replies.commandStatusMessage?.({})).toBe(null);
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackNlgConfig                                                 */
/* ------------------------------------------------------------------ */

describe("DomainPackNlgConfig", () => {
  it("builds with required fields", () => {
    const config: DomainPackNlgConfig = {
      eligibleSkills: ["device.query_status", "device.start"],
      replySystemPrompt: "You are a greenhouse assistant",
    };
    expect(config.eligibleSkills).toHaveLength(2);
    expect(config.replySystemPrompt).toContain("greenhouse");
  });

  it("supports optional prompts", () => {
    const config: DomainPackNlgConfig = {
      eligibleSkills: [],
      replySystemPrompt: "test",
      combinedQuerySystemPrompt: "combined",
      proactiveSummarySystemPrompt: "proactive",
    };
    expect(config.combinedQuerySystemPrompt).toBe("combined");
    expect(config.proactiveSummarySystemPrompt).toBe("proactive");
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackCommandBuilder                                            */
/* ------------------------------------------------------------------ */

describe("DomainPackCommandBuilder", () => {
  it("buildCommandPatch returns a patch", () => {
    const builder: DomainPackCommandBuilder = {
      buildCommandPatch: (intent, target) => ({
        action: "domain.start",
        parameters: { duration_seconds: 600 },
        device_type: target.device.device_type,
      }),
    };
    const patch = builder.buildCommandPatch(makeIntent("device.start"), {
      deployment_id: "dep-001",
      node_id: "node-001",
      device: makeRegistry().devices[0],
    });
    expect(patch).not.toBeNull();
    expect(patch?.action).toBe("domain.start");
    expect(patch?.device_type).toBe("vent");
  });

  it("buildCommandPatch can return null", () => {
    const builder: DomainPackCommandBuilder = {
      buildCommandPatch: () => null,
    };
    expect(
      builder.buildCommandPatch(makeIntent("unknown"), {
        deployment_id: "dep-001",
        node_id: "node-001",
        device: makeRegistry().devices[0],
      }),
    ).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackClarificationHandler                                      */
/* ------------------------------------------------------------------ */

describe("DomainPackClarificationHandler", () => {
  it("tryMergePendingClarification returns intent merge", () => {
    const handler: DomainPackClarificationHandler = {
      tryMergePendingClarification: (text) => ({
        kind: "intent",
        intent: { ...makeIntent("device.start"), raw_text: text },
      }),
    };
    const result = handler.tryMergePendingClarification(
      "10 minutes",
      { missing_slots: ["duration_seconds"], partial: {} },
      {},
    );
    expect(result.kind).toBe("intent");
    if (result.kind === "intent") {
      expect(result.intent.skill).toBe("device.start");
    }
  });

  it("tryMergePendingClarification returns notification_pref", () => {
    const handler: DomainPackClarificationHandler = {
      tryMergePendingClarification: () => ({
        kind: "notification_pref",
        suppress_l2_tonight: true,
      }),
    };
    const result = handler.tryMergePendingClarification(
      "don't notify",
      {
        missing_slots: [],
        partial: {},
      },
      {},
    );
    expect(result.kind).toBe("notification_pref");
  });

  it("tryMergePendingClarification returns none", () => {
    const handler: DomainPackClarificationHandler = {
      tryMergePendingClarification: () => ({ kind: "none" }),
    };
    const result = handler.tryMergePendingClarification(
      "hello",
      {
        missing_slots: [],
        partial: {},
      },
      {},
    );
    expect(result.kind).toBe("none");
  });

  it("supports optional inferClarificationFromIntent", () => {
    const handler: DomainPackClarificationHandler = {
      tryMergePendingClarification: () => ({ kind: "none" }),
      inferClarificationFromIntent: (intent) => ({
        expected_skill: intent.skill,
        missing_slots: ["duration_seconds"],
        partial: {},
      }),
    };
    const draft = handler.inferClarificationFromIntent?.(makeIntent("device.start"));
    expect(draft?.expected_skill).toBe("device.start");
    expect(draft?.missing_slots).toContain("duration_seconds");
  });

  it("supports optional partialFromIntent", () => {
    const handler: DomainPackClarificationHandler = {
      tryMergePendingClarification: () => ({ kind: "none" }),
      partialFromIntent: (intent) => ({ skill: intent.skill }),
    };
    const partial = handler.partialFromIntent?.(makeIntent("device.start"));
    expect(partial?.skill).toBe("device.start");
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackPreDispatchHandler                                        */
/* ------------------------------------------------------------------ */

describe("DomainPackPreDispatchHandler", () => {
  it("handle returns continue", () => {
    const handler: DomainPackPreDispatchHandler = {
      handle: () => ({ type: "continue" }),
    };
    expect(
      handler.handle("pre_safety", makeIntent("device.start"), {
        userId: "user-001",
        model: "gpt-4",
        deploymentId: "dep-001",
      }),
    ).toEqual({ type: "continue" });
  });

  it("handle returns reply", () => {
    const handler: DomainPackPreDispatchHandler = {
      handle: () => ({ type: "reply", reply: "Not allowed", status: 403 }),
    };
    const result = handler.handle("post_confirmation", makeIntent("device.start"), {
      userId: "user-001",
      model: "gpt-4",
      deploymentId: "dep-001",
    });
    expect(result.type).toBe("reply");
    if (result.type === "reply") {
      expect(result.status).toBe(403);
    }
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackSafetyPolicy                                              */
/* ------------------------------------------------------------------ */

describe("DomainPackSafetyPolicy", () => {
  function makeSafetyPolicy(): DomainPackSafetyPolicy {
    return {
      authorization: {
        controlSkills: ["device.start"],
        workerAllowedSkills: ["device.query_status"],
        readonlyAllowedSkills: [],
      },
      confirmDurationThresholdSeconds: 300,
    };
  }

  function makeSafetyCtx(overrides?: Partial<DomainPackSafetyContext>): DomainPackSafetyContext {
    return {
      user_id: "user-001",
      role: "owner",
      skill: "device.start",
      intent: makeIntent("device.start"),
      confirm_duration_threshold_seconds: 300,
      ...overrides,
    };
  }

  it("builds with required authorization and threshold", () => {
    const policy = makeSafetyPolicy();
    expect(policy.authorization.controlSkills).toContain("device.start");
    expect(policy.confirmDurationThresholdSeconds).toBe(300);
  });

  it("supports optional evaluateIntent returning allowed", () => {
    const policy: DomainPackSafetyPolicy = {
      ...makeSafetyPolicy(),
      evaluateIntent: (_ctx) => ({
        allowed: true,
        requires_confirmation: false,
        reason: "owner can control",
      }),
    };
    const decision = policy.evaluateIntent!(makeSafetyCtx());
    expect(decision!.allowed).toBe(true);
    expect(decision!.requires_confirmation).toBe(false);
  });

  it("supports optional evaluateIntent returning denied with confirmation", () => {
    const policy: DomainPackSafetyPolicy = {
      ...makeSafetyPolicy(),
      evaluateIntent: (_ctx) => ({
        allowed: false,
        requires_confirmation: true,
        reason: "worker cannot control",
        reject_code: "ROLE_DENIED",
        guidance: "Ask the owner",
      }),
    };
    const decision = policy.evaluateIntent!(makeSafetyCtx({ role: "worker" }));
    expect(decision!.allowed).toBe(false);
    expect(decision!.reject_code).toBe("ROLE_DENIED");
  });

  it("evaluateIntent can return null (no opinion)", () => {
    const policy: DomainPackSafetyPolicy = {
      ...makeSafetyPolicy(),
      evaluateIntent: () => null,
    };
    expect(policy.evaluateIntent!(makeSafetyCtx())).toBeNull();
  });

  it("supports optional requestedDurationSeconds", () => {
    const policy: DomainPackSafetyPolicy = {
      ...makeSafetyPolicy(),
      requestedDurationSeconds: (intent) =>
        (intent.parameters as { duration_seconds?: number })?.duration_seconds,
    };
    expect(
      policy.requestedDurationSeconds?.({
        ...makeIntent("device.start"),
        parameters: { duration_seconds: 600 },
      }),
    ).toBe(600);
  });

  it("supports optional interlockAction", () => {
    const policy: DomainPackSafetyPolicy = {
      ...makeSafetyPolicy(),
      interlockAction: () => "open",
      interlockConflictReason: "Already opening",
      interlockConflictGuidance: "Wait for completion",
    };
    expect(policy.interlockAction?.(makeIntent("device.start"))).toBe("open");
    expect(policy.interlockConflictReason).toBe("Already opening");
  });

  it("supports optional stopSkills", () => {
    const policy: DomainPackSafetyPolicy = {
      ...makeSafetyPolicy(),
      stopSkills: ["device.stop"],
      stopReason: "Emergency stop",
    };
    expect(policy.stopSkills).toContain("device.stop");
    expect(policy.stopReason).toBe("Emergency stop");
  });

  it("supports optional denialReasons", () => {
    const policy: DomainPackSafetyPolicy = {
      ...makeSafetyPolicy(),
      authorization: {
        ...makeSafetyPolicy().authorization,
        denialReasons: {
          worker: "Workers cannot control devices",
          readonly: "Read-only users cannot control",
        },
      },
    };
    expect(policy.authorization.denialReasons?.worker).toContain("Workers");
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackIntentProcessing                                          */
/* ------------------------------------------------------------------ */

describe("DomainPackIntentProcessing", () => {
  it("supports normalizeUtterance", () => {
    const processing: DomainPackIntentProcessing = {
      isLowConfidenceControlSkill: () => false,
      normalizeUtterance: (text) => text.trim().toLowerCase(),
    };
    expect(processing.normalizeUtterance?.("  Hello  ")).toBe("hello");
  });

  it("supports normalizeLlmShape", () => {
    const processing: DomainPackIntentProcessing = {
      isLowConfidenceControlSkill: () => false,
      normalizeLlmShape: (data) => data,
    };
    expect(processing.normalizeLlmShape?.({ skill: "test" })).toEqual({ skill: "test" });
  });

  it("supports refineIntentFromUtterance", () => {
    const processing: DomainPackIntentProcessing = {
      isLowConfidenceControlSkill: () => false,
      refineIntentFromUtterance: (utterance, intent) => ({
        ...intent,
        raw_text: utterance,
      }),
    };
    const result = processing.refineIntentFromUtterance?.("open vent", makeIntent("device.start"));
    expect(result?.raw_text).toBe("open vent");
  });

  it("supports detectSkillUtteranceConflict", () => {
    const processing: DomainPackIntentProcessing = {
      isLowConfidenceControlSkill: () => false,
      detectSkillUtteranceConflict: (utterance, skill) =>
        utterance.includes("stop") && skill === "device.start",
    };
    expect(processing.detectSkillUtteranceConflict?.("stop the vent", "device.start")).toBe(true);
    expect(processing.detectSkillUtteranceConflict?.("open the vent", "device.start")).toBe(false);
  });

  it("supports prompt guidance", () => {
    const processing: DomainPackIntentProcessing = {
      isLowConfidenceControlSkill: () => false,
      prompt: {
        parserPreamble: "Parse the intent",
        clarificationRule: "Ask if unclear",
      },
    };
    expect(processing.prompt?.parserPreamble).toBe("Parse the intent");
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackStructuralOverrides                                       */
/* ------------------------------------------------------------------ */

describe("DomainPackStructuralOverrides", () => {
  it("supports tryStructuralIntentOverride returning null", () => {
    const overrides: DomainPackStructuralOverrides = {
      tryStructuralIntentOverride: () => null,
      refineIntentFromUtterance: (utterance, intent) => intent,
    };
    expect(overrides.tryStructuralIntentOverride?.("hello")).toBeNull();
  });

  it("supports tryStructuralIntentOverride returning intent", () => {
    const overrides: DomainPackStructuralOverrides = {
      tryStructuralIntentOverride: (utterance) =>
        utterance === "status" ? makeIntent("device.query_status") : null,
      refineIntentFromUtterance: (_u, intent) => intent,
    };
    expect(overrides.tryStructuralIntentOverride?.("status")?.skill).toBe("device.query_status");
  });

  it("supports refineIntentFromUtterance", () => {
    const overrides: DomainPackStructuralOverrides = {
      refineIntentFromUtterance: (utterance, intent) => ({
        ...intent,
        raw_text: utterance,
      }),
    };
    const result = overrides.refineIntentFromUtterance("test", makeIntent("device.start"));
    expect(result.raw_text).toBe("test");
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackModeStore                                                 */
/* ------------------------------------------------------------------ */

describe("DomainPackModeStore", () => {
  it("getMode and setMode", () => {
    const store: DomainPackModeStore = {
      getMode: (entityId) =>
        entityId === "entity-001"
          ? { entity_id: entityId, mode: "auto", updated_by: "user-001" }
          : undefined,
      setMode: (entityId, userId, params) => ({
        entity_id: entityId,
        mode: params.mode as string,
        updated_by: userId,
      }),
    };
    expect(store.getMode("entity-001")?.mode).toBe("auto");
    expect(store.getMode("entity-999")).toBeUndefined();

    const mode = store.setMode("entity-001", "user-001", { mode: "manual" });
    expect(mode.mode).toBe("manual");
    expect(mode.updated_by).toBe("user-001");
  });

  it("supports optional resetForTests", () => {
    const store: DomainPackModeStore = {
      getMode: () => undefined,
      setMode: (entityId) => ({ entity_id: entityId, mode: "auto" }),
      resetForTests: () => {},
    };
    expect(() => store.resetForTests?.()).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackProactiveAlerts                                           */
/* ------------------------------------------------------------------ */

describe("DomainPackProactiveAlerts", () => {
  function makeAlertInput(): DomainPackSustainedAlertInput {
    return {
      deploymentId: "dep-001",
      entityId: "entity-001",
      metric: "temperature_c",
      operator: ">",
      threshold: 35,
      current: 38,
      streakMinutes: 30,
      telemetry: { entity_id: "entity-001", temperature_c: 38 },
      devices: [],
    };
  }

  it("sustainedL1Message returns a string", () => {
    const alerts: DomainPackProactiveAlerts = {
      sustainedL1Message: (input) =>
        `${input.metric} is ${input.current}${input.operator}${input.threshold}`,
      sustainedL2Plan: () => null,
    };
    expect(alerts.sustainedL1Message(makeAlertInput())).toContain("temperature_c");
  });

  it("sustainedL2Plan returns a plan", () => {
    const alerts: DomainPackProactiveAlerts = {
      sustainedL1Message: () => "alert",
      sustainedL2Plan: (input) => ({
        cooldownKeyPrefix: `${input.entityId}:${input.metric}`,
        templateText: "Auto-cooling activated",
        summaryData: { current: input.current },
        confirmIntent: makeIntent("device.start"),
        sceneSkillId: "scene.ventilate",
      }),
    };
    const plan = alerts.sustainedL2Plan(makeAlertInput());
    expect(plan).not.toBeNull();
    expect(plan?.cooldownKeyPrefix).toBe("entity-001:temperature_c");
    expect(plan?.sceneSkillId).toBe("scene.ventilate");
  });

  it("sustainedL2Plan can return null", () => {
    const alerts: DomainPackProactiveAlerts = {
      sustainedL1Message: () => "alert",
      sustainedL2Plan: () => null,
    };
    expect(alerts.sustainedL2Plan(makeAlertInput())).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackScheduledReports                                          */
/* ------------------------------------------------------------------ */

describe("DomainPackScheduledReports", () => {
  it("buildMessage returns a formatted string", () => {
    const reports: DomainPackScheduledReports = {
      buildMessage: (schedule, services) => {
        const telemetry = schedule.entityIds.map((id) => services.getTelemetry(id)).filter(Boolean);
        return `Report for ${schedule.deploymentId}: ${telemetry.length} entities`;
      },
    };
    const schedule: DomainPackScheduledReportSchedule = {
      deploymentId: "dep-001",
      userId: "user-001",
      entityIds: ["entity-001", "entity-002"],
      intervalMinutes: 60,
    };
    const msg = reports.buildMessage(schedule, {
      getTelemetry: (id) =>
        id === "entity-001" ? { entity_id: id, temperature_c: 30 } : undefined,
    });
    expect(msg).toContain("1 entities");
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackPolicySuggestions                                         */
/* ------------------------------------------------------------------ */

describe("DomainPackPolicySuggestions", () => {
  it("buildDrafts returns suggestion drafts", () => {
    const suggestions: DomainPackPolicySuggestions = {
      buildDrafts: ({ alertRules }) =>
        alertRules.map((rule) => ({
          kind: "threshold_adjustment",
          reason: `${rule.metric} threshold ${rule.operator} ${rule.value}`,
          intent: makeIntent("policy.adjust_threshold"),
        })),
      buildAlertRuleUpdate: (intent) => {
        const params = intent.parameters as { value?: number; operator?: string };
        return {
          entity_id: "entity-001",
          metric: "temperature_c",
          operator: ">",
          value: params.value ?? 35,
        };
      },
    };
    const drafts = suggestions.buildDrafts({
      deploymentId: "dep-001",
      alertRules: [{ entity_id: "entity-001", metric: "temperature_c", operator: ">", value: 35 }],
      services: {
        outcomeStatsByScene: () => ({}),
      },
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].kind).toBe("threshold_adjustment");
  });

  it("buildAlertRuleUpdate returns null for unknown intent", () => {
    const suggestions: DomainPackPolicySuggestions = {
      buildDrafts: () => [],
      buildAlertRuleUpdate: () => null,
    };
    expect(suggestions.buildAlertRuleUpdate(makeIntent("unknown.skill"))).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackCommandHooks                                              */
/* ------------------------------------------------------------------ */

describe("DomainPackCommandHooks", () => {
  it("buildCompletedCommandPlan returns a plan", () => {
    const hooks: DomainPackCommandHooks = {
      buildCompletedCommandPlan: ({ command }) => ({
        templateText: `Command ${command.command_id} completed`,
        intent: makeIntent("device.query_status"),
        sceneSkillId: "scene.status",
      }),
      buildDeviceFailurePlan: () => null,
    };
    const plan = hooks.buildCompletedCommandPlan({
      command: { command_id: "cmd-001" } as CommandMessage,
      entityId: "entity-001",
    });
    expect(plan).not.toBeNull();
    expect(plan?.templateText).toContain("cmd-001");
  });

  it("buildCompletedCommandPlan can return null", () => {
    const hooks: DomainPackCommandHooks = {
      buildCompletedCommandPlan: () => null,
      buildDeviceFailurePlan: () => null,
    };
    expect(
      hooks.buildCompletedCommandPlan({
        command: { command_id: "cmd-001" } as CommandMessage,
      }),
    ).toBeNull();
  });

  it("buildDeviceFailurePlan returns a plan", () => {
    const hooks: DomainPackCommandHooks = {
      buildCompletedCommandPlan: () => null,
      buildDeviceFailurePlan: ({ deviceId, failureCount }) => ({
        templateText: `Device ${deviceId} failed ${failureCount} times`,
        sceneSkillId: "scene.alert",
      }),
    };
    const plan = hooks.buildDeviceFailurePlan({
      deviceId: "device-001",
      failureCount: 3,
    });
    expect(plan?.templateText).toContain("device-001");
    expect(plan?.templateText).toContain("3");
  });

  it("supports optional shouldNotifyDeviceFailure", () => {
    const hooks: DomainPackCommandHooks = {
      buildCompletedCommandPlan: () => null,
      buildDeviceFailurePlan: () => null,
      shouldNotifyDeviceFailure: ({ failureCount }) => failureCount >= 3,
    };
    expect(
      hooks.shouldNotifyDeviceFailure?.({
        deviceId: "device-001",
        deploymentId: "dep-001",
        failureCount: 3,
      }),
    ).toBe(true);
    expect(
      hooks.shouldNotifyDeviceFailure?.({
        deviceId: "device-001",
        deploymentId: "dep-001",
        failureCount: 1,
      }),
    ).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackDigest                                                    */
/* ------------------------------------------------------------------ */

describe("DomainPackDigest", () => {
  it("buildMessage for morning slot", () => {
    const digest: DomainPackDigest = {
      buildMessage: ({ slot, deploymentName }) => `Good morning! ${deploymentName} - ${slot}`,
    };
    const msg = digest.buildMessage({
      slot: "morning",
      deploymentName: "Greenhouse Alpha",
      deploymentId: "dep-001",
      services: {
        getAllTelemetry: () => [],
        getModeByEntityId: () => undefined,
        queryLogsToday: () => [],
      },
    });
    expect(msg).toContain("morning");
    expect(msg).toContain("Greenhouse Alpha");
  });

  it("buildMessage for evening slot", () => {
    const digest: DomainPackDigest = {
      buildMessage: ({ slot }) => `Evening report: ${slot}`,
    };
    expect(
      digest.buildMessage({
        slot: "evening",
        deploymentName: "GH1",
        deploymentId: "dep-001",
        services: {
          getAllTelemetry: () => [],
          getModeByEntityId: () => undefined,
          queryLogsToday: () => [],
        },
      }),
    ).toContain("evening");
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackWeeklyAdvice                                              */
/* ------------------------------------------------------------------ */

describe("DomainPackWeeklyAdvice", () => {
  function makeInput(): DomainPackWeeklyAdviceInput {
    return {
      deploymentId: "dep-001",
      pilotRoiSummary: "ROI: 15%",
      sceneOutcomesSummary: "12/15 success",
      telemetry: [],
      alertRules: [],
      recentOperations: [],
    };
  }

  it("buildUserPrompt returns a prompt", () => {
    const advice: DomainPackWeeklyAdvice = {
      systemPrompt: "You are an agricultural advisor",
      buildUserPrompt: (input) =>
        `Deployment: ${input.deploymentId}, ROI: ${input.pilotRoiSummary}`,
      formatFallback: (input) => `Fallback: ${input.sceneOutcomesSummary}`,
    };
    expect(advice.systemPrompt).toContain("agricultural");
    expect(advice.buildUserPrompt(makeInput())).toContain("dep-001");
  });

  it("formatFallback returns text", () => {
    const advice: DomainPackWeeklyAdvice = {
      systemPrompt: "test",
      buildUserPrompt: () => "prompt",
      formatFallback: (input) => `Fallback: ${input.pilotRoiSummary}`,
    };
    expect(advice.formatFallback(makeInput())).toContain("ROI: 15%");
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackWeatherProactive                                          */
/* ------------------------------------------------------------------ */

describe("DomainPackWeatherProactive", () => {
  it("buildColdPlan returns a plan", () => {
    const weather: DomainPackWeatherProactive = {
      buildColdPlan: (alert) => ({
        kind: "cold_alert",
        templateText: `Cold alert: ${alert.message}`,
        data: { alert },
      }),
      buildHeatPlan: () => ({
        kind: "heat_alert",
        templateText: "Heat alert",
        data: {},
      }),
    };
    const alert: DomainPackWeatherAlert = { message: "Temperature dropping" };
    const plan = weather.buildColdPlan(alert);
    expect(plan.kind).toBe("cold_alert");
    expect(plan.templateText).toContain("Temperature dropping");
  });

  it("buildHeatPlan returns a plan", () => {
    const weather: DomainPackWeatherProactive = {
      buildColdPlan: () => ({
        kind: "cold",
        templateText: "cold",
        data: {},
      }),
      buildHeatPlan: ({ alert }) => ({
        kind: "heat",
        templateText: `Heat: ${alert.message}`,
        data: { alert },
      }),
    };
    const plan = weather.buildHeatPlan({
      alert: { message: "High temp" },
      telemetry: [],
    });
    expect(plan.kind).toBe("heat");
    expect(plan.templateText).toContain("High temp");
  });

  it("supports optional buildFlywheelHeatFallbackTelemetry", () => {
    const weather: DomainPackWeatherProactive = {
      buildColdPlan: () => ({ kind: "cold", templateText: "", data: {} }),
      buildHeatPlan: () => ({ kind: "heat", templateText: "", data: {} }),
      buildFlywheelHeatFallbackTelemetry: ({ entities, primary_metric_value }) =>
        entities.map((e) => ({
          entity_id: e.entity_id,
          temperature_c: primary_metric_value,
        })),
    };
    const telemetry = weather.buildFlywheelHeatFallbackTelemetry?.({
      deployment_id: "dep-001",
      primary_metric_value: 38,
      entities: [
        { entity_id: "e1", entity_type: "greenhouse", deployment_id: "dep-001", status: "active" },
      ],
    });
    expect(telemetry).toHaveLength(1);
    expect(telemetry?.[0].entity_id).toBe("e1");
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackRuntime                                                   */
/* ------------------------------------------------------------------ */

describe("DomainPackRuntime", () => {
  function makeRuntime(): DomainPackRuntime {
    return {
      sceneSkillIds: ["scene.vent", "scene.irrigate"],
      isSceneSkillId: (id) => id === "scene.vent",
      resolveSceneForTrigger: (trigger) => (trigger.type === "high_temp" ? "scene.vent" : null),
      resolveSceneFromIntent: (intent) => (intent.skill === "device.start" ? "scene.vent" : null),
      evaluateOutcomeSuccess: (input) => input.command_status === "completed",
      sceneSuccessMetric: (skillId) =>
        skillId === "scene.vent" ? "temperature_delta_max" : "humidity_percent",
      riskLevelForScene: (skillId) =>
        skillId === "scene.vent" ? "L3" : skillId === "scene.irrigate" ? "L2" : undefined,
      riskLevelForPhysicalSkill: (skill, opts) => (opts?.requires_confirmation ? "L3" : "L2"),
      outcomeThresholdsForScene: (skillId) =>
        skillId === "scene.vent" ? { temperature_delta_max: 5 } : { humidity_delta_max: 10 },
    };
  }

  it("sceneSkillIds and isSceneSkillId", () => {
    const runtime = makeRuntime();
    expect(runtime.sceneSkillIds).toHaveLength(2);
    expect(runtime.isSceneSkillId("scene.vent")).toBe(true);
    expect(runtime.isSceneSkillId("scene.unknown")).toBe(false);
  });

  it("resolveSceneForTrigger", () => {
    const runtime = makeRuntime();
    expect(runtime.resolveSceneForTrigger({ type: "high_temp" })).toBe("scene.vent");
    expect(runtime.resolveSceneForTrigger({ type: "low_humidity" })).toBeNull();
  });

  it("resolveSceneFromIntent", () => {
    const runtime = makeRuntime();
    expect(runtime.resolveSceneFromIntent(makeIntent("device.start"))).toBe("scene.vent");
    expect(runtime.resolveSceneFromIntent(makeIntent("device.query_status"))).toBeNull();
  });

  it("evaluateOutcomeSuccess", () => {
    const runtime = makeRuntime();
    expect(
      runtime.evaluateOutcomeSuccess({
        scene_skill_id: "scene.vent",
        command_status: "completed",
        window_minutes: 30,
      }),
    ).toBe(true);
    expect(
      runtime.evaluateOutcomeSuccess({
        scene_skill_id: "scene.vent",
        command_status: "failed",
        window_minutes: 30,
      }),
    ).toBe(false);
  });

  it("sceneSuccessMetric", () => {
    const runtime = makeRuntime();
    expect(runtime.sceneSuccessMetric("scene.vent")).toBe("temperature_delta_max");
    expect(runtime.sceneSuccessMetric("scene.irrigate")).toBe("humidity_percent");
  });

  it("riskLevelForScene", () => {
    const runtime = makeRuntime();
    expect(runtime.riskLevelForScene("scene.vent")).toBe("L3");
    expect(runtime.riskLevelForScene("scene.irrigate")).toBe("L2");
    expect(runtime.riskLevelForScene("unknown")).toBeUndefined();
  });

  it("riskLevelForPhysicalSkill", () => {
    const runtime = makeRuntime();
    expect(runtime.riskLevelForPhysicalSkill("device.start")).toBe("L2");
    expect(runtime.riskLevelForPhysicalSkill("device.start", { requires_confirmation: true })).toBe(
      "L3",
    );
  });

  it("outcomeThresholdsForScene", () => {
    const runtime = makeRuntime();
    expect(runtime.outcomeThresholdsForScene("scene.vent")).toEqual({
      temperature_delta_max: 5,
    });
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackContext                                                   */
/* ------------------------------------------------------------------ */

describe("DomainPackContext", () => {
  it("buildDeploymentContext returns sections", () => {
    const ctx: DomainPackContext = {
      buildDeploymentContext: (registry, deploymentId) => ({
        scene_context_sections: [
          `Deployment: ${deploymentId}`,
          `Devices: ${registry.devices.length}`,
        ],
      }),
    };
    const result = ctx.buildDeploymentContext(makeRegistry(), "dep-001");
    expect(result.scene_context_sections).toHaveLength(2);
    expect(result.scene_context_sections[0]).toContain("dep-001");
  });

  it("supports optional includeTelemetry and includeAlertRules", () => {
    const ctx: DomainPackContext = {
      includeTelemetry: true,
      includeAlertRules: false,
      buildDeploymentContext: () => ({ scene_context_sections: [] }),
    };
    expect(ctx.includeTelemetry).toBe(true);
    expect(ctx.includeAlertRules).toBe(false);
  });

  it("supports optional buildModesSummary", () => {
    const ctx: DomainPackContext = {
      buildDeploymentContext: () => ({ scene_context_sections: [] }),
      buildModesSummary: (telemetry, getMode) => {
        const modes = telemetry.map((t) => getMode(t.entity_id)).filter(Boolean);
        return `${modes.length} active modes`;
      },
    };
    const summary = ctx.buildModesSummary?.(
      [{ entity_id: "entity-001", temperature_c: 30 }],
      (id) => (id === "entity-001" ? { entity_id: id, mode: "auto" } : undefined),
    );
    expect(summary).toBe("1 active modes");
  });
});

/* ------------------------------------------------------------------ */
/* DomainPackConversation                                              */
/* ------------------------------------------------------------------ */

describe("DomainPackConversation", () => {
  it("buildAliasIndex returns aliases", () => {
    const conv: DomainPackConversation = {
      buildAliasIndex: (registry, deploymentId) => ({
        [deploymentId]: registry.devices.map((d) => d.name),
      }),
    };
    const index = conv.buildAliasIndex?.(makeRegistry(), "dep-001");
    expect(index?.["dep-001"]).toContain("Vent 1");
  });

  it("matchCompoundQuery detects compound queries", () => {
    const conv: DomainPackConversation = {
      matchCompoundQuery: (text) => text.includes("和"),
    };
    expect(conv.matchCompoundQuery?.("开天窗和 irrigation")).toBe(true);
    expect(conv.matchCompoundQuery?.("just one thing")).toBe(false);
  });

  it("buildCompoundQueryIntents returns intent map", () => {
    const conv: DomainPackConversation = {
      buildCompoundQueryIntents: (deploymentId) => ({
        [deploymentId]: makeIntent("device.start"),
      }),
    };
    const intents = conv.buildCompoundQueryIntents?.("dep-001");
    expect(intents?.["dep-001"].skill).toBe("device.start");
  });
});
