import type {
  DomainPackCommandPatch,
  IntentPayload,
  SceneResolvedDeviceTarget,
} from "@embodied-agent/core";
import { getConfiguredRuntimeSettings, resolveActiveDomainPackContracts } from "./loader.js";
import type { PlatformRuntimeContext } from "./context.js";

export type { SceneResolvedDeviceTarget } from "@embodied-agent/core";

function activeContracts(ctx: PlatformRuntimeContext) {
  return resolveActiveDomainPackContracts(ctx.loader, getConfiguredRuntimeSettings(ctx.loader));
}

function domainConfigFor(ctx: PlatformRuntimeContext, packId: string): unknown {
  return getConfiguredRuntimeSettings(ctx.loader).domain_configs?.[packId];
}

function isPrepareError(value: IntentPayload | { ok: false; reason: string }): value is {
  ok: false;
  reason: string;
} {
  return "ok" in value && value.ok === false;
}

export function isPhysicalControlSkill(
  ctx: PlatformRuntimeContext,
  intent: IntentPayload,
): boolean {
  return activeContracts(ctx).some((contract) =>
    contract.core.targetResolver.isPhysicalControlSkill(intent),
  );
}

export function resolveDeviceTarget(
  ctx: PlatformRuntimeContext,
  intent: IntentPayload,
): { ok: true; target: SceneResolvedDeviceTarget } | { ok: false; reason: string } {
  const registry = ctx.services.getLoadRegistry()();
  const settings = getConfiguredRuntimeSettings(ctx.loader);
  const contract = activeContracts(ctx).find((item) =>
    item.core.targetResolver.isPhysicalControlSkill(intent),
  );
  if (!contract) {
    return { ok: false, reason: "不支持的物理控制技能或目标无法解析。" };
  }
  const packId = contract.core.manifest.id;
  const domainConfig = domainConfigFor(ctx, packId);
  const prepared =
    contract.core.targetResolver.preparePhysicalIntent?.(intent, { domainConfig }) ?? intent;
  if (isPrepareError(prepared)) {
    return { ok: false, reason: prepared.reason };
  }
  return contract.core.targetResolver.resolveDeviceTarget(prepared, registry, {
    deployment_id: settings.deployment_id,
    domainConfig,
  });
}

export function buildDomainCommandPatch(
  ctx: PlatformRuntimeContext,
  intent: IntentPayload,
  target: SceneResolvedDeviceTarget,
): DomainPackCommandPatch | null {
  const contract = activeContracts(ctx).find((item) =>
    item.core.targetResolver.isPhysicalControlSkill(intent),
  );
  return contract?.core.commandAdapter?.commandBuilder?.buildCommandPatch(intent, target) ?? null;
}

export async function executeDomainPhysicalCommand(
  ctx: PlatformRuntimeContext,
  intent: IntentPayload,
  target: SceneResolvedDeviceTarget,
): Promise<
  | { handled: false }
  | {
      handled: true;
      result: unknown;
      failureCode: string;
      logFields?: Record<string, unknown>;
    }
> {
  const contract = activeContracts(ctx).find((item) =>
    item.core.commandAdapter?.physicalExecutor?.canExecuteTarget(target),
  );
  const executor = contract?.core.commandAdapter?.physicalExecutor;
  if (!executor) return { handled: false };
  return {
    handled: true,
    result: await executor.execute(intent, target, {
      domainConfig: domainConfigFor(ctx, contract.core.manifest.id),
    }),
    failureCode: executor.failureCode ?? "domain_physical_executor_failed",
    logFields: executor.logFields,
  };
}

export function domainPhysicalFailureCode(
  ctx: PlatformRuntimeContext,
  target: SceneResolvedDeviceTarget,
): string {
  const contract = activeContracts(ctx).find((item) =>
    item.core.commandAdapter?.physicalExecutor?.canExecuteTarget(target),
  );
  return (
    contract?.core.commandAdapter?.physicalExecutor?.failureCode ??
    "domain_physical_executor_failed"
  );
}
