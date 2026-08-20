import type { DomainPackCommandReplies, IntentPayload } from "@embodied-agent/core";
import { getContractCapabilityValue } from "./contract.js";
import { getConfiguredRuntimeSettings, resolveActiveDomainPackContracts } from "./loader.js";
import type { PlatformRuntimeContext } from "./context.js";

function commandRepliesForContract(
  contract: ReturnType<typeof resolveActiveDomainPackContracts>[number],
) {
  return (
    contract.core.commandAdapter?.commandReplies ??
    getContractCapabilityValue<DomainPackCommandReplies>(contract, "command-replies")
  );
}

export function domainPhysicalCommandSentReply(
  ctx: PlatformRuntimeContext,
  skill: IntentPayload["skill"],
): string | undefined {
  for (const contract of resolveActiveDomainPackContracts(
    ctx.loader,
    getConfiguredRuntimeSettings(ctx.loader),
  )) {
    const reply = commandRepliesForContract(contract)?.physicalCommandSentReply?.(skill);
    if (reply) return reply;
  }
  return undefined;
}

export function domainPendingSummary(
  ctx: PlatformRuntimeContext,
  intent: IntentPayload,
): string | undefined {
  for (const contract of resolveActiveDomainPackContracts(
    ctx.loader,
    getConfiguredRuntimeSettings(ctx.loader),
  )) {
    const summary = commandRepliesForContract(contract)?.pendingSummary?.(intent);
    if (summary) return summary;
  }
  return undefined;
}

function commandReplyServices(ctx: PlatformRuntimeContext): Record<string, unknown> {
  return {
    deviceRegistry: {
      entityIdFromDeviceId(deviceId: string): string | undefined {
        return ctx.services
          .getLoadRegistry()()
          .devices.find((device) => device.device_id === deviceId)?.entity_id;
      },
    },
  };
}

export function domainCommandStatusMessage(
  ctx: PlatformRuntimeContext,
  record: unknown,
): string | null {
  for (const contract of resolveActiveDomainPackContracts(
    ctx.loader,
    getConfiguredRuntimeSettings(ctx.loader),
  )) {
    const message = commandRepliesForContract(contract)?.commandStatusMessage?.(record, {
      services: commandReplyServices(ctx),
    });
    if (message) return message;
  }
  return null;
}
