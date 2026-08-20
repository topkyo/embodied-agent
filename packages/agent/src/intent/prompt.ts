import { buildIntentPrompt } from "./prompt/build-intent-prompt.js";
import type { AgentRuntimeBindings } from "../runtime-bindings.js";

export type { DeploymentContext } from "./prompt/types.js";
import type { DeploymentContext } from "./prompt/types.js";

export function buildSystemPrompt(bindings: AgentRuntimeBindings, ctx: DeploymentContext): string {
  return buildIntentPrompt(bindings, {
    ctx,
    mode: "resolve",
    intentContract: bindings.buildIntentContract(bindings.getEffectiveSettings()),
  });
}

const USER_UTTERANCE_START = "<<<USER_UTTERANCE>>>";
const USER_UTTERANCE_END = "<<<END_USER_UTTERANCE>>>";

export const USER_UTTERANCE_MARKERS = {
  start: USER_UTTERANCE_START,
  end: USER_UTTERANCE_END,
} as const;

/** Neutralize delimiter substrings so user text cannot break out of the bounded region. */
export function escapeUserUtteranceMarkers(text: string): string {
  return text
    .replaceAll(USER_UTTERANCE_START, "[ESCAPED_USER_UTTERANCE]")
    .replaceAll(USER_UTTERANCE_END, "[ESCAPED_END_USER_UTTERANCE]");
}

export function buildUserMessage(text: string): string {
  const trimmed = escapeUserUtteranceMarkers(text.trim());
  return `${USER_UTTERANCE_START}\n${trimmed}\n${USER_UTTERANCE_END}`;
}
