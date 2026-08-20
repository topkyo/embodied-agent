import type { AgentRuntimeBindings } from "../runtime-bindings.js";

export function normalizeUtterance(bindings: AgentRuntimeBindings, text: string): string {
  return bindings.normalizeUtterance(text, bindings.getEffectiveSettings());
}
