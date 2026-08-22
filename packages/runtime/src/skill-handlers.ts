import type {
  DomainPackContract,
  DomainPackSkillHandler,
  IntentPayload,
} from "@embodied-agent/core";
import { getContractCapabilityValue } from "./contract.js";
import { getConfiguredRuntimeSettings, resolveActiveDomainPackContracts } from "./loader.js";
import { pickPlatformDomainServices } from "./services.js";
import type { PlatformRuntimeContext } from "./context.js";

export type DomainHandlerResult = {
  reply: string;
  params: Record<string, unknown>;
};

export type DomainSkillHandlerServicesResolver = (
  contract: DomainPackContract,
  handler: DomainPackSkillHandler,
) => Record<string, unknown>;

export async function executeDomainSkillHandler(
  ctx: PlatformRuntimeContext,
  intent: IntentPayload,
  context: { userId?: string } = {},
  resolveServices: DomainSkillHandlerServicesResolver = (_contract, handler) =>
    pickPlatformDomainServices(ctx.services, handler.serviceKeys),
): Promise<DomainHandlerResult | null> {
  const settings = getConfiguredRuntimeSettings(ctx.loader);
  for (const contract of resolveActiveDomainPackContracts(ctx.loader, settings)) {
    const handler = getContractCapabilityValue<DomainPackSkillHandler>(contract, "skill-handler");
    if (!handler?.canHandle(intent)) continue;
    return handler.handle(intent, {
      domainConfig: settings.domain_configs?.[contract.core.manifest.id],
      deploymentId: settings.deployment_id,
      userId: context.userId,
      services: resolveServices(contract, handler),
    });
  }
  return null;
}
