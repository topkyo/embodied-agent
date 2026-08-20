import type {
  DeviceRegistry,
  DomainPackContract,
  DomainPackCore,
  DomainPackManifest,
  DomainPackReadinessIssue,
} from "@embodied-agent/core";
import {
  assembleDomainPackContract,
  defineDomainPackCore,
  packRootFromModuleUrl,
  resolvePackEvalPaths,
} from "@embodied-agent/domain-sdk";
import { INDUSTRIAL_PACK } from "../manifest.js";
import {
  INDUSTRIAL_P0_SKILLS,
  INDUSTRIAL_P1_SKILLS,
  INDUSTRIAL_PHYSICAL_DEFINITIONS,
  INDUSTRIAL_PHYSICAL_SKILLS,
} from "../skills.js";
import { industrialIntentSchemas } from "../schemas/intent-industrial.js";
import { SCENE_SKILL_PROMPT_SECTION } from "../prompt/scene-skills.js";
import { INDUSTRIAL_INTENT_CONTRACT } from "../prompt/intent-contract.js";
import { INDUSTRIAL_INTENT_PROCESSING } from "./intent-processing.js";
import { tryStructuralIntentOverride } from "../structural/structural-intent.js";
import {
  isIndustrialPhysicalControlSkill,
  resolveIndustrialDeviceTarget,
} from "./target-resolver.js";
import { buildIndustrialCommandPatch } from "./command-builder.js";
import {
  industrialCommandStatusMessage,
  industrialPendingSummary,
  industrialPhysicalCommandSentReply,
} from "./command-replies.js";
import { INDUSTRIAL_SAFETY_POLICY } from "./safety.js";
import { canHandleIndustrialSkill, handleIndustrialSkill } from "./skill-handler.js";
import {
  SCENE_SKILL_IDS,
  evaluateOutcomeSuccess,
  isSceneSkillId,
  outcomeThresholdsForScene,
  resolveSceneForTrigger,
  resolveSceneFromIntent,
  riskLevelForPhysicalSkill,
  riskLevelForScene,
  sceneSuccessMetric,
} from "./registry.js";
import { buildIndustrialSceneContext } from "./context.js";
import { resolveIndustrialOpsControlAction } from "./ops-control.js";
import { INDUSTRIAL_PROACTIVE_ALERTS } from "./sustained-alert.js";
import { INDUSTRIAL_SCHEDULED_REPORTS } from "./status-report.js";

function validateIndustrialConfig(domainConfig: unknown): DomainPackReadinessIssue[] {
  const cfg = (domainConfig ?? {}) as { default_cabinet_id?: string };
  if (!cfg.default_cabinet_id?.trim()) {
    return [
      {
        code: "default_cabinet_id_missing",
        message: "industrial 交付缺少 domain_configs.industrial.default_cabinet_id。",
        severity: "error",
      },
    ];
  }
  return [];
}

function validateIndustrialRegistry(
  registry: DeviceRegistry,
  deploymentId: string,
  domainConfig: unknown,
  onlineNodeIds?: readonly string[],
): DomainPackReadinessIssue[] {
  const issues: DomainPackReadinessIssue[] = [];
  const cfg = (domainConfig ?? {}) as { default_cabinet_id?: string };
  const cabinetId = cfg.default_cabinet_id?.trim();
  const deployment = registry.deployments.find((item) => item.deployment_id === deploymentId);
  const cabinet = registry.entities.find(
    (entity) =>
      entity.deployment_id === deploymentId &&
      entity.domain_id === "industrial" &&
      entity.entity_type === "cabinet" &&
      entity.entity_id === cabinetId &&
      entity.status === "active",
  );
  const fan = registry.devices.find(
    (device) =>
      device.deployment_id === deploymentId &&
      device.entity_id === cabinetId &&
      device.device_type === "fan" &&
      device.default_for === "exhaust_fan" &&
      device.status === "active",
  );
  const sensor = registry.devices.find(
    (device) =>
      device.deployment_id === deploymentId &&
      device.entity_id === cabinetId &&
      device.device_type === "sensor" &&
      device.status === "active" &&
      device.metrics?.includes("temperature_c"),
  );

  if (!deployment || deployment.status !== "active") {
    issues.push({
      code: "deployment_missing_or_disabled",
      message: `部署 ${deploymentId} 未注册或未启用。`,
      severity: "error",
    });
  }
  if (!cabinet) {
    issues.push({
      code: "industrial_cabinet_missing",
      message: `默认配电柜 ${cabinetId ?? "(missing)"} 未注册为 active industrial cabinet。`,
      severity: "error",
    });
  }
  if (!sensor) {
    issues.push({
      code: "industrial_temperature_sensor_missing",
      message: `默认配电柜 ${cabinetId ?? "(missing)"} 缺少 active temperature_c sensor。`,
      severity: "error",
    });
  }
  if (!fan) {
    issues.push({
      code: "industrial_exhaust_fan_missing",
      message: `默认配电柜 ${cabinetId ?? "(missing)"} 缺少 active 默认排风 fan。`,
      severity: "error",
    });
  } else if (
    !registry.nodes?.some(
      (node) =>
        node.deployment_id === deploymentId &&
        node.node_id === fan.node_id &&
        node.status === "active",
    )
  ) {
    issues.push({
      code: "industrial_exhaust_node_missing",
      message: `排风设备 ${fan.device_id} 未绑定 active Scene Node。`,
      severity: "error",
    });
  } else if (onlineNodeIds && !onlineNodeIds.includes(fan.node_id)) {
    issues.push({
      code: "industrial_exhaust_node_offline",
      message: `排风设备 ${fan.device_id} 绑定节点 ${fan.node_id} 当前离线。`,
      severity: "error",
    });
  }

  return issues;
}

export function createDomainPackCore(): DomainPackCore {
  const manifest: DomainPackManifest = {
    id: INDUSTRIAL_PACK.id,
    displayName: INDUSTRIAL_PACK.displayName,
    status: INDUSTRIAL_PACK.status,
    eval: resolvePackEvalPaths(
      packRootFromModuleUrl(import.meta.url, "@embodied-agent/domain-industrial"),
      INDUSTRIAL_PACK.eval,
    ),
    ...(INDUSTRIAL_PACK.channelOnboarding
      ? {
          channelOnboarding: {
            examples: [...INDUSTRIAL_PACK.channelOnboarding.examples],
          },
        }
      : {}),
  };

  return defineDomainPackCore({
    manifest,
    skills: {
      p0: INDUSTRIAL_P0_SKILLS,
      p1: INDUSTRIAL_P1_SKILLS,
      physical: INDUSTRIAL_PHYSICAL_SKILLS,
      physicalDefinitions: INDUSTRIAL_PHYSICAL_DEFINITIONS,
    },
    intentSchemas: industrialIntentSchemas,
    prompt: {
      section: SCENE_SKILL_PROMPT_SECTION,
      contract: INDUSTRIAL_INTENT_CONTRACT,
      processing: INDUSTRIAL_INTENT_PROCESSING,
    },
    eval: manifest.eval,
    structuralOverrides: {
      tryStructuralIntentOverride,
    },
    targetResolver: {
      isPhysicalControlSkill: isIndustrialPhysicalControlSkill,
      resolveDeviceTarget: resolveIndustrialDeviceTarget,
    },
    commandAdapter: {
      commandBuilder: {
        buildCommandPatch: buildIndustrialCommandPatch,
      },
      commandReplies: {
        physicalCommandSentReply: industrialPhysicalCommandSentReply,
        pendingSummary: industrialPendingSummary,
        commandStatusMessage: industrialCommandStatusMessage,
      },
    },
    safety: INDUSTRIAL_SAFETY_POLICY,
    readiness: {
      requiredTransports: ["mqtt"],
      probeNotRequired: {
        reason:
          "industrial 排风设备走 MQTT，无 HTTP 探针端点；设备在线状态由 heartbeat + validateRegistry 的 onlineNodeIds 检查覆盖",
      },
      flywheel: {
        requiredNodes: ["node-sim-industrial-001"],
        requiredTelemetry: [{ entity_id: "cabinet-001", metric: "temperature_c" }],
      },
      flywheelGate: {
        adapterModule: "@embodied-agent/domain-industrial/flywheel-adapter",
        description: "industrial overheat exhaust domain flywheel",
        reportPath: "local-eval-reports/industrial-flywheel-report.json",
      },
      validateConfig: ({ domainConfig }) => validateIndustrialConfig(domainConfig),
      validateRegistry: ({ registry, deployment_id, domainConfig, onlineNodeIds }) =>
        validateIndustrialRegistry(registry, deployment_id, domainConfig, onlineNodeIds),
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
      buildDeploymentContext: buildIndustrialSceneContext,
    },
  });
}

export function createDomainPackContract(): DomainPackContract {
  const core = createDomainPackCore();
  return assembleDomainPackContract(core, {
    resolveControlAction: resolveIndustrialOpsControlAction,
    opsTabWidgets: { overview: "industrial-overview" },
    opsDeviceTemplate: [
      {
        device_id: "sensor-{node}",
        device_type: "sensor",
        name: "柜体温度传感器",
        channel: "i2c:0x48",
        metrics: ["temperature_c"],
        status: "active",
      },
      {
        device_id: "fan-{node}",
        device_type: "fan",
        name: "排风风机",
        channel: "relay:exhaust",
        default_for: "exhaust_fan",
        status: "active",
      },
    ],
    opsSettingsFields: [
      {
        id: "default_cabinet_id",
        label: "Default Cabinet ID",
        scope: "domain",
        type: "string",
        control: "text",
        save_target: "domain_config",
        required: true,
      },
    ],
    skillHandler: {
      serviceKeys: ["telemetry", "commands"],
      canHandle: canHandleIndustrialSkill,
      handle: handleIndustrialSkill,
    },
    proactiveAlerts: INDUSTRIAL_PROACTIVE_ALERTS,
    scheduledReports: INDUSTRIAL_SCHEDULED_REPORTS,
  });
}
