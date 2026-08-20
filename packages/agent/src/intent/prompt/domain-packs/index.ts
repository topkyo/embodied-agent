import type { AgentRuntimeBindings } from "../../../runtime-bindings.js";

/** Scene NL mapping — loaded from active Domain Packs. */
export function sceneSkillSection(bindings: AgentRuntimeBindings): string {
  return bindings.buildScenePromptSection(bindings.getEffectiveSettings());
}
