import type {
  DeviceRegistry,
  DomainPackContract,
  DomainPackCore,
  DomainPackFactoryContext,
  DomainPackManifest,
  DomainPackReadinessIssue,
} from "@embodied-agent/core";
import {
  assembleDomainPackContract,
  defineDomainPackCore,
  packRootFromModuleUrl,
  resolvePackEvalPaths,
} from "@embodied-agent/domain-sdk";
import { GREENHOUSE_PACK } from "../manifest.js";
import {
  GREENHOUSE_P0_SKILLS,
  GREENHOUSE_P1_SKILLS,
  GREENHOUSE_PHYSICAL_DEFINITIONS,
  GREENHOUSE_PHYSICAL_SKILLS,
} from "../skills.js";
import { greenhouseIntentSchemas } from "../schemas/intent-greenhouse.js";
import { SCENE_SKILL_PROMPT_SECTION } from "../prompt/scene-skills.js";
import { GREENHOUSE_INTENT_CONTRACT } from "../prompt/intent-contract.js";
import {
  tryStructuralIntentOverride,
  refineIrrigationFromUtterance,
} from "../structural/structural-intent.js";
import { resolveAgricultureOpsControlAction } from "./ops-control.js";
import {
  isGreenhousePhysicalControlSkill,
  resolveGreenhouseDeviceTarget,
} from "./target-resolver.js";
import {
  SCENE_SKILL_IDS,
  isSceneSkillId,
  resolveSceneForTrigger,
  resolveSceneFromIntent,
  evaluateOutcomeSuccess,
  sceneSuccessMetric,
} from "./registry.js";
import { buildGreenhouseSceneContext } from "./context.js";
import { canHandleGreenhouseSkill, handleGreenhouseSkill } from "./skill-handler.js";
import { riskLevelForScene, riskLevelForPhysicalSkill } from "./risk-level.js";
import { outcomeThresholdsForScene } from "./outcome-thresholds.js";
import {
  greenhousePendingSummary,
  greenhousePhysicalCommandSentReply,
} from "./physical-replies.js";
import { buildGreenhouseCommandStatusMessage } from "./command-notification.js";
import type { GreenhouseCommandRecord } from "./command-status.js";
import {
  createGreenhouseModeStore,
  initGreenhouseModeStore,
  type ModeStoreDeps,
} from "./mode-store.js";
import {
  GREENHOUSE_COMBINED_QUERY_NLG_SYSTEM_PROMPT,
  GREENHOUSE_NLG_ELIGIBLE_SKILLS,
  GREENHOUSE_PROACTIVE_NLG_SYSTEM_PROMPT,
  GREENHOUSE_REPLY_NLG_SYSTEM_PROMPT,
} from "./nlg.js";
import { GREENHOUSE_SCHEDULED_REPORTS } from "./status-report.js";
import { buildGreenhouseCommandPatch } from "./command-builder.js";
import {
  greenhouseClarificationPartialFromIntent,
  inferGreenhouseClarificationFromIntent,
  tryMergeGreenhousePendingClarification,
} from "./clarification.js";
import { handleGreenhousePreDispatch } from "./pre-dispatch.js";
import {
  buildGreenhouseAliasIndex,
  buildGreenhouseDeploymentWeatherIntents,
  isGreenhouseDeploymentWeatherQuery,
} from "./conversation.js";
import { GREENHOUSE_SAFETY_POLICY } from "./safety.js";
import { GREENHOUSE_INTENT_PROCESSING } from "./intent-processing.js";
import { GREENHOUSE_PROACTIVE_ALERTS } from "./sustained-alert.js";
import { GREENHOUSE_POLICY_SUGGESTIONS } from "./policy-suggestions.js";
import { GREENHOUSE_COMMAND_HOOKS } from "./command-hooks.js";
import { GREENHOUSE_DIGEST } from "./digest.js";
import { GREENHOUSE_WEEKLY_ADVICE } from "./weekly-advice.js";
import { GREENHOUSE_WEATHER_PROACTIVE } from "./weather-proactive.js";
import {
  parseFlywheelGreenhouseIds,
  resolveGreenhouseFlywheelReadiness,
  validateGreenhouseConfig,
} from "./flywheel-readiness.js";

export { GREENHOUSE_PACK } from "../manifest.js";
export type { ModeStoreDeps } from "./mode-store.js";

function validateGreenhouseRegistryWithConfig(
  registry: DeviceRegistry,
  deploymentId: string,
  domainConfig: unknown,
  onlineNodeIds?: readonly string[],
): DomainPackReadinessIssue[] {
  const issues = validateGreenhouseRegistry(registry, deploymentId, onlineNodeIds);
  for (const greenhouseId of parseFlywheelGreenhouseIds(domainConfig)) {
    const registered = registry.entities.some(
      (entity) =>
        entity.deployment_id === deploymentId &&
        entity.domain_id === "agriculture" &&
        entity.entity_type === "greenhouse" &&
        entity.entity_id === greenhouseId &&
        entity.status === "active",
    );
    if (!registered) {
      issues.push({
        code: "flywheel_greenhouse_not_registered",
        message: `flywheel_greenhouse_ids 中的 ${greenhouseId} 未注册为 active greenhouse entity。`,
        severity: "error",
      });
    }
  }
  return issues;
}

function validateGreenhouseRegistry(
  registry: DeviceRegistry,
  deploymentId: string,
  onlineNodeIds?: readonly string[],
): DomainPackReadinessIssue[] {
  const issues: DomainPackReadinessIssue[] = [];
  const deployment = registry.deployments.find((d) => d.deployment_id === deploymentId);
  const greenhouses = registry.entities.filter(
    (entity) =>
      entity.deployment_id === deploymentId &&
      entity.domain_id === "agriculture" &&
      entity.entity_type === "greenhouse" &&
      entity.status === "active",
  );
  const devices = registry.devices.filter((device) => device.deployment_id === deploymentId);
  const activeNodes = (registry.nodes ?? []).filter(
    (node) => node.deployment_id === deploymentId && node.status === "active",
  );
  const activeNodeIds = new Set(activeNodes.map((node) => node.node_id));
  const onlineNodeSet = onlineNodeIds ? new Set(onlineNodeIds) : undefined;

  const requireDefaultDevice = (
    greenhouseId: string,
    deviceType: "vent_motor" | "fan" | "greenhouse_controller" | "irrigation_valve",
    defaultFor: "vent_motor" | "fan" | "greenhouse_controller" | "irrigation",
  ) => {
    const device = devices.find(
      (item) =>
        item.entity_id === greenhouseId &&
        item.device_type === deviceType &&
        item.default_for === defaultFor &&
        item.status === "active",
    );
    if (!device) {
      issues.push({
        code: `${defaultFor}_missing`,
        message: `${greenhouseId} 缺少 active 默认 ${deviceType} 设备。`,
        severity: "error",
      });
      return;
    }
    if (!device.node_id || !activeNodeIds.has(device.node_id)) {
      issues.push({
        code: `${defaultFor}_node_missing`,
        message: `${greenhouseId} 默认 ${deviceType} 未绑定 active Scene Node。`,
        severity: "error",
      });
      return;
    }
    if (onlineNodeSet && !onlineNodeSet.has(device.node_id)) {
      issues.push({
        code: `${defaultFor}_node_offline`,
        message: `${greenhouseId} 默认 ${deviceType} 绑定节点 ${device.node_id} 当前离线。`,
        severity: "error",
      });
    }
  };

  if (!deployment || deployment.status !== "active") {
    issues.push({
      code: "deployment_missing_or_disabled",
      message: `部署 ${deploymentId} 未注册或未启用。`,
      severity: "error",
    });
  }
  if (greenhouses.length === 0) {
    issues.push({
      code: "greenhouse_entity_missing",
      message: `部署 ${deploymentId} 未注册 active greenhouse entity。`,
      severity: "error",
    });
  }
  if (activeNodes.length === 0) {
    issues.push({
      code: "scene_node_missing",
      message: `部署 ${deploymentId} 未注册 active Scene Node。`,
      severity: "error",
    });
  }
  for (const greenhouse of greenhouses) {
    requireDefaultDevice(greenhouse.entity_id, "vent_motor", "vent_motor");
    requireDefaultDevice(greenhouse.entity_id, "fan", "fan");
    requireDefaultDevice(greenhouse.entity_id, "greenhouse_controller", "greenhouse_controller");
    requireDefaultDevice(greenhouse.entity_id, "irrigation_valve", "irrigation");
  }

  return issues;
}

export function createDomainPackCore(): DomainPackCore {
  const manifest: DomainPackManifest = {
    id: GREENHOUSE_PACK.id,
    displayName: GREENHOUSE_PACK.displayName,
    status: GREENHOUSE_PACK.status,
    eval: resolvePackEvalPaths(
      packRootFromModuleUrl(import.meta.url, "@embodied-agent/domain-agriculture"),
      GREENHOUSE_PACK.eval,
    ),
    ...(GREENHOUSE_PACK.channelOnboarding
      ? {
          channelOnboarding: {
            examples: [...GREENHOUSE_PACK.channelOnboarding.examples],
          },
        }
      : {}),
  };

  return defineDomainPackCore({
    manifest,
    skills: {
      p0: GREENHOUSE_P0_SKILLS,
      p1: GREENHOUSE_P1_SKILLS,
      physical: GREENHOUSE_PHYSICAL_SKILLS,
      physicalDefinitions: GREENHOUSE_PHYSICAL_DEFINITIONS,
    },
    intentSchemas: greenhouseIntentSchemas,
    prompt: {
      section: SCENE_SKILL_PROMPT_SECTION,
      contract: GREENHOUSE_INTENT_CONTRACT,
      processing: GREENHOUSE_INTENT_PROCESSING,
    },
    eval: manifest.eval,
    structuralOverrides: {
      tryStructuralIntentOverride,
      refineIntentFromUtterance: refineIrrigationFromUtterance,
    },
    targetResolver: {
      isPhysicalControlSkill: isGreenhousePhysicalControlSkill,
      resolveDeviceTarget: resolveGreenhouseDeviceTarget,
    },
    commandAdapter: {
      commandBuilder: {
        buildCommandPatch: buildGreenhouseCommandPatch,
      },
      commandReplies: {
        physicalCommandSentReply: greenhousePhysicalCommandSentReply,
        pendingSummary: greenhousePendingSummary,
        commandStatusMessage(record, context) {
          const deviceRegistry = context?.services?.deviceRegistry as
            { entityIdFromDeviceId?: (deviceId: string) => string | undefined } | undefined;
          return buildGreenhouseCommandStatusMessage(record as GreenhouseCommandRecord, {
            entityIdFromDeviceId: deviceRegistry?.entityIdFromDeviceId,
          });
        },
      },
    },
    safety: GREENHOUSE_SAFETY_POLICY,
    readiness: {
      requiredTransports: ["mqtt"],
      probeNotRequired: {
        reason:
          "greenhouse 设备走 MQTT，无 HTTP 探针端点；设备在线状态由 heartbeat + validateRegistry 覆盖",
      },
      flywheelGate: {
        adapterModule: "@embodied-agent/domain-agriculture/flywheel-adapter",
        description: "agriculture greenhouse L3/L4 dual-simulator flywheel",
        reportPath: "local-eval-reports/agriculture-flywheel-report.json",
      },
      validateConfig: ({ domainConfig }) => validateGreenhouseConfig(domainConfig),
      resolveFlywheel: ({ registry, deployment_id, domainConfig }) =>
        resolveGreenhouseFlywheelReadiness(registry, deployment_id, domainConfig),
      validateRegistry: ({ registry, deployment_id, domainConfig, onlineNodeIds }) =>
        validateGreenhouseRegistryWithConfig(registry, deployment_id, domainConfig, onlineNodeIds),
    },
    sceneRuntime: {
      sceneSkillIds: SCENE_SKILL_IDS,
      isSceneSkillId,
      resolveSceneForTrigger,
      resolveSceneFromIntent,
      evaluateOutcomeSuccess,
      sceneSuccessMetric,
      riskLevelForScene,
      riskLevelForPhysicalSkill,
      outcomeThresholdsForScene,
    },
    context: {
      includeTelemetry: true,
      includeAlertRules: true,
      buildDeploymentContext: buildGreenhouseSceneContext,
      buildModesSummary(telemetry, getMode) {
        const modeLines: string[] = [];
        for (const t of telemetry) {
          const mode = getMode(t.entity_id);
          if (mode?.mode === "night_vent" && mode.temp_high_c != null) {
            modeLines.push(`${t.entity_id} 夜间模式≥${mode.temp_high_c}°C`);
          }
        }
        return modeLines.length > 0 ? modeLines.join("；") : undefined;
      },
    },
  });
}

export function createDomainPackContract(
  options: DomainPackFactoryContext = {},
): DomainPackContract {
  if (options.storage) {
    initGreenhouseModeStore(options.storage satisfies ModeStoreDeps);
  }

  const core = createDomainPackCore();
  return assembleDomainPackContract(core, {
    resolveControlAction: resolveAgricultureOpsControlAction,
    opsTabWidgets: { overview: "agriculture-overview" },
    opsDeviceTemplate: [
      {
        device_id: "sensor-{node}",
        device_type: "sensor",
        name: "温湿度传感器",
        channel: "i2c:0x44",
        metrics: ["temperature_c", "humidity_percent"],
        status: "active",
      },
      {
        device_id: "vent-{node}",
        device_type: "vent_motor",
        name: "左侧帘",
        channel: "relay:vent_left",
        default_for: "vent_motor",
        status: "active",
      },
      {
        device_id: "fan-{node}",
        device_type: "fan",
        name: "风机",
        channel: "relay:fan_01",
        status: "active",
      },
      {
        device_id: "controller-{node}",
        device_type: "greenhouse_controller",
        name: "环控器",
        default_for: "greenhouse_controller",
        status: "active",
      },
    ],
    satellite: true,
    skillHandler: {
      serviceKeys: [
        "telemetry",
        "mode",
        "alertRules",
        "reportSchedules",
        "alertEvents",
        "operationLogs",
        "satelliteNdvi",
        "agronomyPests",
        "sceneTasks",
        "weeklyAdvice",
        "policySuggestions",
        "weather",
      ],
      canHandle: canHandleGreenhouseSkill,
      handle: handleGreenhouseSkill,
    },
    nlg: {
      eligibleSkills: GREENHOUSE_NLG_ELIGIBLE_SKILLS,
      replySystemPrompt: GREENHOUSE_REPLY_NLG_SYSTEM_PROMPT,
      combinedQuerySystemPrompt: GREENHOUSE_COMBINED_QUERY_NLG_SYSTEM_PROMPT,
      proactiveSummarySystemPrompt: GREENHOUSE_PROACTIVE_NLG_SYSTEM_PROMPT,
    },
    clarification: {
      tryMergePendingClarification: tryMergeGreenhousePendingClarification,
      inferClarificationFromIntent: inferGreenhouseClarificationFromIntent,
      partialFromIntent: greenhouseClarificationPartialFromIntent,
    },
    preDispatch: {
      handle: handleGreenhousePreDispatch,
    },
    conversation: {
      buildAliasIndex: buildGreenhouseAliasIndex,
      matchCompoundQuery: isGreenhouseDeploymentWeatherQuery,
      buildCompoundQueryIntents: buildGreenhouseDeploymentWeatherIntents,
    },
    modeStore: createGreenhouseModeStore(),
    proactiveAlerts: GREENHOUSE_PROACTIVE_ALERTS,
    scheduledReports: GREENHOUSE_SCHEDULED_REPORTS,
    policySuggestions: GREENHOUSE_POLICY_SUGGESTIONS,
    commandHooks: GREENHOUSE_COMMAND_HOOKS,
    digest: GREENHOUSE_DIGEST,
    weeklyAdvice: GREENHOUSE_WEEKLY_ADVICE,
    weatherProactive: GREENHOUSE_WEATHER_PROACTIVE,
  });
}
