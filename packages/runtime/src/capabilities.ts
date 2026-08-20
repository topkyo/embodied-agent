import type { DomainPackCapabilities, DomainPackContract } from "@embodied-agent/core";

export function domainPackCapabilitiesFromContract(
  contract: DomainPackContract,
): DomainPackCapabilities {
  const kinds = new Set(contract.capabilities.map((capability) => capability.kind));
  return {
    digest: kinds.has("digest"),
    weeklyAdvice: kinds.has("weekly-advice"),
    weatherProactive: kinds.has("weather-proactive"),
    scheduledReports: kinds.has("scheduled-reports"),
    policySuggestions: kinds.has("policy-suggestions"),
    satellite: kinds.has("satellite"),
  };
}
