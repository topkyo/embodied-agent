import type { DeploymentContext } from "./types.js";
import {
  DEFAULT_CLARIFICATION_RULE,
  CONFIDENCE_RULE,
  DEFAULT_INTENT_PARSER_PREAMBLE,
  skillEnumSection,
} from "./core.js";
import { deploymentTargetJson, formatDeploymentContext } from "./context.js";
import { sceneSkillSection } from "./domain-packs/index.js";
import type { AgentRuntimeBindings } from "../../runtime-bindings.js";

export type IntentPromptMode = "resolve" | "repair-schema" | "repair-json";

export type IntentPromptOptions = {
  ctx: DeploymentContext;
  mode?: IntentPromptMode;
  intentContract?: string;
};

const MINIMAL_REPAIR_PREAMBLE = `你是具身 Agent 意图解析器。只输出一行 JSON，禁止 markdown。`;

export function buildIntentPrompt(
  bindings: AgentRuntimeBindings,
  opts: IntentPromptOptions,
): string {
  const { ctx, mode = "resolve" } = opts;
  if (mode !== "resolve") {
    return MINIMAL_REPAIR_PREAMBLE;
  }

  const deploymentTarget = deploymentTargetJson(ctx);
  const contract = opts.intentContract?.trim();
  if (!contract) {
    throw new Error("active Domain Pack 缺少 intentContract。");
  }
  const guidance = bindings.buildIntentPromptGuidance(
    bindings.getEffectiveSettings(),
    deploymentTarget,
  );

  return [
    guidance.parserPreamble ?? DEFAULT_INTENT_PARSER_PREAMBLE,
    skillEnumSection(bindings),
    formatDeploymentContext(ctx),
    guidance.disambiguationRules,
    guidance.clarificationRule ?? DEFAULT_CLARIFICATION_RULE,
    CONFIDENCE_RULE,
    sceneSkillSection(bindings),
    guidance.examples,
    `契约摘要：\n${contract}`,
  ]
    .filter((section): section is string => Boolean(section?.trim()))
    .join("\n\n");
}
