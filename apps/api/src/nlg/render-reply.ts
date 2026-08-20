import type { SkillName } from "@embodied-agent/core";
import { createFetchLlmClient, isFlashTierModel } from "@embodied-agent/agent";
import { createSceneOpsLlmClient, sceneOpsLlmModel } from "../scene/llm-model.js";
import { getEffectiveSettings } from "../settings/store.js";
import type { LlmChatTurn } from "@embodied-agent/agent";
import { activeNlgConfig } from "@embodied-agent/runtime";
import { llmUsageFields, recordNlgLog } from "./observability.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";

export function isNlgEligibleSkill(skill: string): skill is SkillName {
  return activeNlgConfig(getPlatformRuntimeContext())?.eligibleSkills.includes(skill) ?? false;
}

const NLG_CACHE_TTL_MS = 5 * 60 * 1000;
const nlgCache = new Map<string, { reply: string; at: number }>();

function nlgCacheKey(
  skill: string,
  templateReply: string,
  userText: string,
  history?: readonly LlmChatTurn[],
): string | null {
  if (history && history.length > 0) return null;
  return `${skill}:${templateReply}:${userText}`;
}

function baseNlgEnabled(): boolean {
  const s = getEffectiveSettings();
  return s.nlg_enabled !== false && Boolean(s.llm_api_key);
}

/** Query-class NLG; Flash tier skips second pass unless nlg_flash_enabled. */
export function isNlgEnabled(): boolean {
  if (!baseNlgEnabled()) return false;
  const s = getEffectiveSettings();
  if (isFlashTierModel(s.llm_model) && s.nlg_flash_enabled !== true) {
    return false;
  }
  return true;
}

export function clearNlgCache(): void {
  nlgCache.clear();
}

export async function renderReply(opts: {
  skill: string;
  templateReply: string;
  userText: string;
  params?: Record<string, unknown>;
  history?: readonly LlmChatTurn[];
}): Promise<string> {
  if (!isNlgEnabled() || !isNlgEligibleSkill(opts.skill)) {
    return opts.templateReply;
  }

  const cacheKey = nlgCacheKey(opts.skill, opts.templateReply, opts.userText, opts.history);
  if (cacheKey) {
    const cached = nlgCache.get(cacheKey);
    if (cached && Date.now() - cached.at < NLG_CACHE_TTL_MS) {
      return cached.reply;
    }
  }

  const settings = getEffectiveSettings();
  const client = createFetchLlmClient({
    apiKey: settings.llm_api_key,
    baseUrl: settings.llm_base_url,
    model: settings.llm_model,
    thinking: settings.llm_thinking,
    timeoutMs: 12_000,
  });

  const nlg = activeNlgConfig(getPlatformRuntimeContext());
  if (!nlg) return opts.templateReply;
  const user = [
    `用户问：${opts.userText}`,
    `技能：${opts.skill}`,
    `结构化回复草稿：\n${opts.templateReply}`,
    opts.params ? `结构化数据：${JSON.stringify(opts.params)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const started = Date.now();
  client.resetUsage?.();
  try {
    const text = await client.completeText(nlg.replySystemPrompt, user, opts.history);
    const reply = text.trim() || opts.templateReply;
    recordNlgLog({
      kind: "query",
      model: settings.llm_model,
      skill: opts.skill,
      latency_ms: Date.now() - started,
      ...llmUsageFields(client.lastUsage?.()),
    });
    if (cacheKey) {
      nlgCache.set(cacheKey, { reply, at: Date.now() });
    }
    return reply;
  } catch (e) {
    recordNlgLog({
      kind: "query",
      model: settings.llm_model,
      skill: opts.skill,
      latency_ms: Date.now() - started,
      ...llmUsageFields(client.lastUsage?.()),
      error: e instanceof Error ? e.message : String(e),
    });
    return opts.templateReply;
  }
}

export async function renderCombinedQueryReply(opts: {
  userText: string;
  statusReply: string;
  weatherReply: string;
  templateReply: string;
  history?: readonly LlmChatTurn[];
}): Promise<string> {
  if (!isNlgEnabled()) return opts.templateReply;
  const nlg = activeNlgConfig(getPlatformRuntimeContext());
  if (!nlg?.combinedQuerySystemPrompt) return opts.templateReply;

  const settings = getEffectiveSettings();
  const client = createFetchLlmClient({
    apiKey: settings.llm_api_key,
    baseUrl: settings.llm_base_url,
    model: settings.llm_model,
    thinking: settings.llm_thinking,
    timeoutMs: 12_000,
  });

  const user = [
    `用户问：${opts.userText}`,
    `【大棚概况】\n${opts.statusReply}`,
    `【天气预报】\n${opts.weatherReply}`,
  ].join("\n\n");

  const started = Date.now();
  client.resetUsage?.();
  try {
    const text = await client.completeText(nlg.combinedQuerySystemPrompt, user, opts.history);
    recordNlgLog({
      kind: "combined_query",
      model: settings.llm_model,
      latency_ms: Date.now() - started,
      ...llmUsageFields(client.lastUsage?.()),
    });
    return text.trim() || opts.templateReply;
  } catch (e) {
    recordNlgLog({
      kind: "combined_query",
      model: settings.llm_model,
      latency_ms: Date.now() - started,
      ...llmUsageFields(client.lastUsage?.()),
      error: e instanceof Error ? e.message : String(e),
    });
    return opts.templateReply;
  }
}

export async function renderProactiveSummary(opts: {
  kind: string;
  templateText: string;
  data?: Record<string, unknown>;
}): Promise<string> {
  if (!baseNlgEnabled()) return opts.templateText;
  const nlg = activeNlgConfig(getPlatformRuntimeContext());
  if (!nlg?.proactiveSummarySystemPrompt) return opts.templateText;

  const settings = getEffectiveSettings();
  const client = createSceneOpsLlmClient(settings);

  const user = `类型：${opts.kind}\n草稿：\n${opts.templateText}\n${opts.data ? `数据：${JSON.stringify(opts.data)}` : ""}`;

  const started = Date.now();
  client.resetUsage?.();
  try {
    const text = await client.completeText(nlg.proactiveSummarySystemPrompt, user);
    recordNlgLog({
      kind: "proactive_summary",
      model: sceneOpsLlmModel(),
      proactive_kind: opts.kind,
      latency_ms: Date.now() - started,
      ...llmUsageFields(client.lastUsage?.()),
    });
    return text.trim() || opts.templateText;
  } catch (e) {
    recordNlgLog({
      kind: "proactive_summary",
      model: sceneOpsLlmModel(),
      proactive_kind: opts.kind,
      latency_ms: Date.now() - started,
      ...llmUsageFields(client.lastUsage?.()),
      error: e instanceof Error ? e.message : String(e),
    });
    return opts.templateText;
  }
}
