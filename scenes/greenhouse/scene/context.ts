import type { DeviceRegistry } from "@embodied-agent/core";
import { buildGreenhouseAliasIndex } from "./conversation.js";

export type GreenhouseSceneContext = {
  scene_context_sections: string[];
};

export function buildGreenhouseSceneContext(
  registry: DeviceRegistry,
  deployment_id: string,
): GreenhouseSceneContext {
  const aliasesByGreenhouse = buildGreenhouseAliasIndex(registry, deployment_id);

  const aliasLines = Object.entries(aliasesByGreenhouse)
    .map(([id, aliases]) => `- ${id}: ${aliases.join("、")}`)
    .join("\n");

  return {
    scene_context_sections: [`温室 ID 对照：\n${aliasLines}`],
  };
}
