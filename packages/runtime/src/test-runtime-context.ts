import type { DeviceRegistry, DomainPackContract, DomainPackCore } from "@embodied-agent/core";
import { createPlatformRuntimeContext, type PlatformRuntimeContext } from "./context.js";
import {
  configureDomainPackCatalog,
  configureDomainPackLoader,
  createDomainPackLoaderHolder,
} from "./loader.js";
import { createPlatformServiceHolder } from "./services.js";

export const TEST_DEPLOYMENT_ID = "dep-test-001";
export const TEST_NODE_ID = "node-test-001";
export const TEST_DEVICE_ID = "device-test-001";

export function makeActiveRegistry(overrides: Partial<DeviceRegistry> = {}): DeviceRegistry {
  return {
    deployments: [
      {
        deployment_id: TEST_DEPLOYMENT_ID,
        status: "active",
        name: "test",
        timezone: "Asia/Shanghai",
      },
    ],
    entities: [],
    nodes: [
      {
        deployment_id: TEST_DEPLOYMENT_ID,
        node_id: TEST_NODE_ID,
        status: "active",
        name: "test-node",
      },
    ],
    devices: [
      {
        deployment_id: TEST_DEPLOYMENT_ID,
        device_id: TEST_DEVICE_ID,
        node_id: TEST_NODE_ID,
        status: "active",
        transport: "mqtt",
        name: "test-device",
        device_type: "test-device",
        aliases: [],
      },
    ],
    ...overrides,
  };
}

export function makeTestCore(overrides: Partial<DomainPackCore> = {}): DomainPackCore {
  return {
    manifest: {
      id: "test-pack",
      displayName: "Test Pack",
      status: "live",
    },
    skills: { p0: [], p1: [], physical: ["device.control"] },
    intentSchemas: [],
    prompt: { section: "", contract: "" },
    eval: {
      golden: "",
      matrixExtra: "",
      matrixWechat: "",
      matrixNegative: "",
    },
    structuralOverrides: {},
    targetResolver: {
      isPhysicalControlSkill: (intent) => intent.skill === "device.control",
      resolveDeviceTarget: () => ({ ok: false, reason: "未配置目标解析" }),
    },
    commandAdapter: {
      commandReplies: {},
    },
    safety: {
      confirmDurationThresholdSeconds: 600,
      authorization: {
        controlSkills: ["device.control"],
        workerAllowedSkills: ["device.query"],
        readonlyAllowedSkills: ["device.query"],
      },
    },
    sceneRuntime: {
      sceneSkillIds: [],
      isSceneSkillId: () => false,
      resolveSceneForTrigger: () => null,
      resolveSceneFromIntent: () => null,
      evaluateOutcomeSuccess: () => true,
      sceneSuccessMetric: () => "completion",
      riskLevelForScene: () => "L1",
      riskLevelForPhysicalSkill: () => "L2",
      outcomeThresholdsForScene: () => ({}),
    },
    context: {
      buildDeploymentContext: () => ({ scene_context_sections: [] }),
    },
    ...overrides,
  };
}

export function makeTestContract(
  core: DomainPackCore,
  capabilities: DomainPackContract["capabilities"] = [],
): DomainPackContract {
  return { core, capabilities };
}

export type RuntimeTestContextOptions = {
  registry?: DeviceRegistry;
  nodeOnline?: boolean;
  contract?: DomainPackContract;
  deploymentId?: string;
  activeDomain?: string;
};

export function makeRuntimeTestContext(
  options: RuntimeTestContextOptions = {},
): PlatformRuntimeContext {
  const deploymentId = options.deploymentId ?? TEST_DEPLOYMENT_ID;
  const activeDomain = options.activeDomain ?? "test-pack";
  const core = options.contract?.core ?? makeTestCore();
  const contract = options.contract ?? makeTestContract(core);

  const loader = createDomainPackLoaderHolder();
  configureDomainPackCatalog(loader, [
    {
      id: activeDomain,
      module: "@embodied-agent/domain-test",
      displayName: "Test Pack",
      webSlug: "test-pack",
      status: "live",
    },
  ]);
  configureDomainPackLoader(loader, {
    getEffectiveSettings: () => ({
      deployment_id: deploymentId,
      active_domain: activeDomain,
      domain_configs: {},
    }),
  });
  loader.packContractCache.set(activeDomain, contract);

  const registry = options.registry ?? makeActiveRegistry();
  const services = createPlatformServiceHolder();
  services.configureRuntimeServices({
    loadRegistry: () => registry,
    getNodeRuntimeStatus: (_nodeId, _now, _deploymentId) => ({
      online: options.nodeOnline ?? true,
      reported_at: Date.now(),
    }),
    preDispatchServices: {},
  });

  return createPlatformRuntimeContext({ services, loader });
}
