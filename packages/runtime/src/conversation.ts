import type { DomainPackConversation, IntentPayload } from "@embodied-agent/core";
import { getContractCapabilityValue } from "./contract.js";
import { getConfiguredRuntimeSettings, getPrimaryDomainPackContract } from "./loader.js";
import type { PlatformRuntimeContext } from "./context.js";

export type DomainAliasIndex = Record<string, string[]>;

function activeConversation(ctx: PlatformRuntimeContext): DomainPackConversation | undefined {
  return getContractCapabilityValue<DomainPackConversation>(
    getPrimaryDomainPackContract(ctx.loader, getConfiguredRuntimeSettings(ctx.loader)),
    "conversation",
  );
}

export function buildActiveDomainAliasIndex(ctx: PlatformRuntimeContext): DomainAliasIndex {
  const settings = getConfiguredRuntimeSettings(ctx.loader);
  const contract = getPrimaryDomainPackContract(ctx.loader, settings);
  const build = activeConversation(ctx)?.buildAliasIndex;
  if (!build) return {};
  return build(
    ctx.services.getLoadRegistry()(),
    settings.deployment_id,
    settings.domain_configs?.[contract.core.manifest.id],
  );
}

export function matchActiveDomainCompoundQuery(ctx: PlatformRuntimeContext, text: string): boolean {
  return activeConversation(ctx)?.matchCompoundQuery?.(text) ?? false;
}

export function buildActiveDomainCompoundQueryIntents(
  ctx: PlatformRuntimeContext,
): Record<string, IntentPayload> {
  const settings = getConfiguredRuntimeSettings(ctx.loader);
  return activeConversation(ctx)?.buildCompoundQueryIntents?.(settings.deployment_id) ?? {};
}
