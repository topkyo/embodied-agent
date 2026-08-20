import { URL } from "node:url";
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
import { ROBOT_PACK } from "../manifest.js";
import {
  ROBOT_P0_SKILLS,
  ROBOT_P1_SKILLS,
  ROBOT_PHYSICAL_DEFINITIONS,
  ROBOT_PHYSICAL_SKILLS,
} from "../skills.js";
import { robotIntentSchemas } from "../schemas/intent-robot.js";
import { SCENE_SKILL_PROMPT_SECTION } from "../prompt/scene-skills.js";
import { ROBOT_INTENT_CONTRACT } from "../prompt/intent-contract.js";
import { tryStructuralIntentOverride } from "../structural/structural-intent.js";
import {
  isRobotPhysicalControlSkill,
  prepareRobotPhysicalIntent,
  resolveRobotDeviceTarget,
} from "./target-resolver.js";
import { executeRobotIntent } from "../m20/executor.js";
import { canHandleRobotSkill, handleRobotSkill } from "./skill-handler.js";
import {
  robotCommandStatusMessage,
  robotPendingSummary,
  robotPhysicalCommandSentReply,
} from "./physical-replies.js";
import {
  SCENE_SKILL_IDS,
  isSceneSkillId,
  resolveSceneForTrigger,
  resolveSceneFromIntent,
  evaluateOutcomeSuccess,
  sceneSuccessMetric,
  riskLevelForScene,
  riskLevelForPhysicalSkill,
  outcomeThresholdsForScene,
} from "./registry.js";
import { buildRobotSceneContext } from "./context.js";
import { buildRobotCommandPatch } from "./command-builder.js";
import { ROBOT_SAFETY_POLICY } from "./safety.js";
import { ROBOT_INTENT_PROCESSING } from "./intent-processing.js";
import { resolveRoboticsOpsControlAction } from "./ops-control.js";

function validateRobotConfig(domainConfig: unknown): DomainPackReadinessIssue[] {
  const cfg = (domainConfig ?? {}) as {
    m20_base_url?: string;
    default_robot_id?: string;
  };
  const issues: DomainPackReadinessIssue[] = [];
  const baseUrl = cfg.m20_base_url?.trim();
  const defaultRobotId = cfg.default_robot_id?.trim();

  if (!baseUrl) {
    issues.push({
      code: "m20_base_url_missing",
      message: "robotics 交付缺少 domain_configs.robotics.m20_base_url。",
      severity: "error",
    });
  } else {
    try {
      new URL(baseUrl);
    } catch {
      issues.push({
        code: "m20_base_url_invalid",
        message: "domain_configs.robotics.m20_base_url 不是有效 URL。",
        severity: "error",
      });
    }
  }
  if (!defaultRobotId) {
    issues.push({
      code: "default_robot_id_missing",
      message: "robotics 交付缺少 domain_configs.robotics.default_robot_id。",
      severity: "error",
    });
  }

  return issues;
}

function validateRobotRegistry(
  registry: DeviceRegistry,
  deploymentId: string,
  domainConfig: unknown,
  onlineNodeIds?: readonly string[],
): DomainPackReadinessIssue[] {
  const issues: DomainPackReadinessIssue[] = [];
  const cfg = (domainConfig ?? {}) as { default_robot_id?: string };
  const defaultRobotId = cfg.default_robot_id?.trim();
  const deployment = registry.deployments.find((d) => d.deployment_id === deploymentId);
  const robot = defaultRobotId
    ? registry.devices.find(
        (device) =>
          device.deployment_id === deploymentId &&
          device.device_id === defaultRobotId &&
          device.device_type === "robot_dog" &&
          device.status === "active",
      )
    : undefined;

  if (!deployment || deployment.status !== "active") {
    issues.push({
      code: "deployment_missing_or_disabled",
      message: `部署 ${deploymentId} 未注册或未启用。`,
      severity: "error",
    });
  }
  if (defaultRobotId && !robot) {
    issues.push({
      code: "default_robot_missing",
      message: `default_robot_id ${defaultRobotId} 未在当前部署注册为 robot_dog。`,
      severity: "error",
    });
  }
  if (robot && robot.transport !== "m20_http") {
    issues.push({
      code: "robot_transport_invalid",
      message: `机器人 ${robot.device_id} transport 必须为 m20_http。`,
      severity: "error",
    });
  }
  if (
    robot &&
    !registry.nodes?.some(
      (node) =>
        node.deployment_id === deploymentId &&
        node.node_id === robot.node_id &&
        node.status === "active",
    )
  ) {
    issues.push({
      code: "robot_node_missing",
      message: `机器人 ${robot.device_id} 未绑定 active node。`,
      severity: "error",
    });
  }
  if (robot && onlineNodeIds && !onlineNodeIds.includes(robot.node_id)) {
    issues.push({
      code: "robot_node_offline",
      message: `机器人 ${robot.device_id} 绑定的 node ${robot.node_id} 当前不在线。`,
      severity: "error",
    });
  }

  return issues;
}

async function probeM20Http(domainConfig: unknown) {
  const cfg = (domainConfig ?? {}) as { m20_base_url?: string; timeout_ms?: number };
  const baseUrl = cfg.m20_base_url?.trim()?.replace(/\/+$/, "");
  if (!baseUrl) return [];
  const controller = new AbortController();
  const timeout = Math.min(Math.max(Number(cfg.timeout_ms ?? 2000), 250), 5000);
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${baseUrl}/body/status`, { signal: controller.signal });
    return [
      {
        id: "m20_http_probe",
        ok: res.ok,
        label: "M20 HTTP Probe",
        detail: res.ok ? "/body/status ok" : `/body/status HTTP ${res.status}`,
        severity: "error" as const,
      },
    ];
  } catch (e) {
    return [
      {
        id: "m20_http_probe",
        ok: false,
        label: "M20 HTTP Probe",
        detail: e instanceof Error ? e.message : String(e),
        severity: "error" as const,
      },
    ];
  } finally {
    clearTimeout(timer);
  }
}

export function createDomainPackCore(): DomainPackCore {
  const manifest: DomainPackManifest = {
    id: ROBOT_PACK.id,
    displayName: ROBOT_PACK.displayName,
    status: ROBOT_PACK.status,
    eval: resolvePackEvalPaths(
      packRootFromModuleUrl(import.meta.url, "@embodied-agent/domain-robotics"),
      ROBOT_PACK.eval,
    ),
    ...(ROBOT_PACK.channelOnboarding
      ? {
          channelOnboarding: {
            examples: [...ROBOT_PACK.channelOnboarding.examples],
          },
        }
      : {}),
  };

  return defineDomainPackCore({
    manifest,
    skills: {
      p0: ROBOT_P0_SKILLS,
      p1: ROBOT_P1_SKILLS,
      physical: ROBOT_PHYSICAL_SKILLS,
      physicalDefinitions: ROBOT_PHYSICAL_DEFINITIONS,
    },
    intentSchemas: robotIntentSchemas,
    prompt: {
      section: SCENE_SKILL_PROMPT_SECTION,
      contract: ROBOT_INTENT_CONTRACT,
      processing: ROBOT_INTENT_PROCESSING,
    },
    eval: manifest.eval,
    structuralOverrides: {
      tryStructuralIntentOverride,
    },
    targetResolver: {
      isPhysicalControlSkill: isRobotPhysicalControlSkill,
      preparePhysicalIntent: prepareRobotPhysicalIntent,
      resolveDeviceTarget: resolveRobotDeviceTarget,
    },
    commandAdapter: {
      commandBuilder: {
        buildCommandPatch: buildRobotCommandPatch,
      },
      physicalExecutor: {
        canExecuteTarget: (target) => target.transport === "m20_http",
        execute: (intent, _target, context) => executeRobotIntent(intent, context.domainConfig),
        failureCode: "m20_http_failed",
        logFields: { transport: "m20_http" },
      },
      commandReplies: {
        physicalCommandSentReply: robotPhysicalCommandSentReply,
        pendingSummary: robotPendingSummary,
        commandStatusMessage: robotCommandStatusMessage,
      },
    },
    safety: ROBOT_SAFETY_POLICY,
    readiness: {
      // HTTP 执行端；连接态由 probe() 覆盖，不要求平台 mqtt_url。
      requiredTransports: ["m20_http"],
      flywheelGate: {
        adapterModule: "@embodied-agent/domain-robotics/flywheel-adapter",
        description: "robotics M20 inspection evidence flywheel",
        reportPath: "local-eval-reports/robotics-flywheel-report.json",
      },
      validateConfig: ({ domainConfig }) => validateRobotConfig(domainConfig),
      validateRegistry: ({ registry, deployment_id, domainConfig, onlineNodeIds }) =>
        validateRobotRegistry(registry, deployment_id, domainConfig, onlineNodeIds),
      probe: ({ domainConfig }) => probeM20Http(domainConfig),
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
      buildDeploymentContext: buildRobotSceneContext,
    },
  });
}

export function createDomainPackContract(): DomainPackContract {
  const core = createDomainPackCore();
  return assembleDomainPackContract(core, {
    resolveControlAction: resolveRoboticsOpsControlAction,
    opsTabWidgets: {
      overview: "robotics-overview",
      settings: "robotics-settings",
      devices: "robotics-devices",
      control: "robotics-control",
      review: "robotics-review",
    },
    opsDeviceTemplate: [
      {
        device_id: "robot-{node}",
        device_type: "robot_dog",
        name: "M20 机器狗",
        default_for: "robot_dog",
        status: "active",
      },
    ],
    opsSettingsFields: [
      {
        id: "m20_base_url",
        label: "M20 HTTP Base URL",
        scope: "domain",
        type: "string",
        control: "text",
        save_target: "domain_config",
        required: true,
      },
      {
        id: "default_robot_id",
        label: "Default Robot ID",
        scope: "domain",
        type: "string",
        control: "text",
        save_target: "domain_config",
        required: true,
      },
    ],
    skillHandler: {
      serviceKeys: ["domainDataStore"],
      canHandle: canHandleRobotSkill,
      handle: handleRobotSkill,
    },
  });
}
