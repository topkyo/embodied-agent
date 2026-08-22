import type { DomainPackAuthorizationPolicy, DomainPackSafetyPolicy } from "@embodied-agent/core";
import { getConfiguredRuntimeSettings, getPrimaryDomainPackContract } from "./loader.js";
import type { PlatformRuntimeContext } from "./context.js";

export function activeDomainSafetyPolicy(ctx: PlatformRuntimeContext): DomainPackSafetyPolicy {
  const contract = getPrimaryDomainPackContract(
    ctx.loader,
    getConfiguredRuntimeSettings(ctx.loader),
  );
  if (!contract.core.safety) {
    throw new Error(`Domain Pack ${contract.core.manifest.id} 未声明 safety policy。`);
  }
  return contract.core.safety;
}

export function activeDomainAuthorizationPolicy(
  ctx: PlatformRuntimeContext,
): DomainPackAuthorizationPolicy {
  return activeDomainSafetyPolicy(ctx).authorization;
}
