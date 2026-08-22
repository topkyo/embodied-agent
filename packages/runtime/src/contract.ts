import type { DomainPackCapabilityKind, DomainPackContract } from "@embodied-agent/core";

/** Contract-first capability lookup. */
export function getContractCapabilityValue<T>(
  contract: DomainPackContract,
  kind: DomainPackCapabilityKind,
): T | undefined {
  const capability = contract.capabilities.find((item) => item.kind === kind);
  if (!capability) return undefined;
  if (kind === "nlg" && "config" in capability) return capability.config as T;
  if ("value" in capability) return capability.value as T;
  return undefined;
}

export function domainPackCapabilityKinds(
  contract: DomainPackContract,
): readonly DomainPackCapabilityKind[] {
  return contract.capabilities.map((capability) => capability.kind);
}
