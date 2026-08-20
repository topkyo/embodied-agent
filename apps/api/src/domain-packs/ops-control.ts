import type {
  DomainPackContract,
  DomainPackOpsAction,
  IntentPayload,
  OpsCapability,
  OpsControlResolveInput,
} from "@embodied-agent/core";

export type OpsControlIntentContext = Omit<OpsControlResolveInput, "action">;

function opsCapability(contract: DomainPackContract): OpsCapability | undefined {
  const capability = contract.capabilities.find((item) => item.kind === "ops");
  return capability?.kind === "ops" ? capability : undefined;
}

/** 将 ops schema control action 解析为可路由 intent（contract-first）。 */
export function resolveOpsControlIntent(
  contract: DomainPackContract,
  action: DomainPackOpsAction,
  context: OpsControlIntentContext,
): IntentPayload {
  if (action.target) {
    return {
      skill: action.skill,
      target: action.target,
      parameters: action.parameters ?? {},
      confidence: 0.95,
    };
  }
  const resolve = opsCapability(contract)?.resolveControlAction;
  if (!resolve) {
    throw new Error(
      `Domain Pack ${contract.core.manifest.id} 的 control action ${action.skill} 缺少 ops.resolveControlAction。`,
    );
  }
  return resolve({ action, ...context });
}
