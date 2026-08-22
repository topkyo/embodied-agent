import { buildCanonicalSimRegistry } from "@embodied-agent/domain-agriculture";
import { saveRegistry } from "@embodied-agent/node";

export const CANONICAL_SIM_REGISTRY = buildCanonicalSimRegistry();

export function seedCanonicalSimRegistry(): void {
  saveRegistry(CANONICAL_SIM_REGISTRY);
}
