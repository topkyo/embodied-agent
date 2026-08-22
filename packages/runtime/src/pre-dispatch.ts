import type {
  DomainPackPreDispatchHandler,
  DomainPackPreDispatchPhase,
  DomainPackPreDispatchResult,
  IntentPayload,
} from "@embodied-agent/core";
import { getContractCapabilityValue } from "./contract.js";
import { getConfiguredRuntimeSettings, getPrimaryDomainPackContract } from "./loader.js";
import type { PlatformRuntimeContext } from "./context.js";

export type DomainPreDispatchContext = {
  user_id: string;
  conversation_id?: string;
  model: string;
};

export function executeDomainPreDispatch(
  ctx: PlatformRuntimeContext,
  phase: DomainPackPreDispatchPhase,
  intent: IntentPayload,
  dispatchCtx: DomainPreDispatchContext,
  services?: Record<string, unknown>,
): DomainPackPreDispatchResult {
  const settings = getConfiguredRuntimeSettings(ctx.loader);
  const handler = getContractCapabilityValue<DomainPackPreDispatchHandler>(
    getPrimaryDomainPackContract(ctx.loader, settings),
    "pre-dispatch",
  );
  if (!handler) return { type: "continue" };
  const resolvedServices = services ?? ctx.services.getPreDispatchServices();
  return handler.handle(phase, intent, {
    userId: dispatchCtx.user_id,
    conversationId: dispatchCtx.conversation_id,
    model: dispatchCtx.model,
    deploymentId: settings.deployment_id,
    services: resolvedServices,
  });
}
