import type { IntentPayload } from "@embodied-agent/core";
import type { AgentRuntimeBindings } from "../runtime-bindings.js";
import { refineIntentFromUtterance } from "./normalize.js";
import { tryStructuralIntentOverride } from "./structural-intent.js";
import {
  buildSystemPrompt,
  buildUserMessage,
  escapeUserUtteranceMarkers,
  type DeploymentContext,
} from "./prompt.js";
import { validateLlmJson, type IntentValidationResult } from "./validate.js";
import { clarificationMessage, serviceUnavailableMessage } from "./clarify.js";
import { recordIntentLog, type IntentLogEntry } from "./observability.js";
import { buildSchemaRepairUserMessage } from "./schema-contract.js";
import { intentResponseFormat, useStrictJsonSchema } from "./intent-json-schema.js";
import { recordIntentFailureUnified } from "./failure-store.js";

export class LlmUnavailableError extends Error {
  readonly code = "LLM_UNAVAILABLE";
  constructor(message = "LLM service unavailable") {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

export type LlmChatTurn = { role: "user" | "assistant"; content: string };

export type LlmUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type LlmClient = {
  completeJson(system: string, user: string, history?: readonly LlmChatTurn[]): Promise<string>;
  completeText(system: string, user: string, history?: readonly LlmChatTurn[]): Promise<string>;
  lastUsage?(): LlmUsage | undefined;
  resetUsage?(): void;
};

export type ResolveIntentResult =
  | { ok: true; validation: IntentValidationResult & { kind: "intent" } }
  | {
      ok: true;
      validation: {
        kind: "clarification";
        message: string;
        repairable?: boolean;
        zodError?: string;
      };
    }
  | { ok: false; unavailable: true; message: string };

export const DEFAULT_ESCALATE_MODEL = "deepseek-v4-pro";

export function isFlashTierModel(model: string): boolean {
  return /flash|deepseek-chat/i.test(model);
}

export {
  evaluateProEscalation,
  isUserCorrectionUtterance,
  detectSkillUtteranceConflict,
  type ProEscalationReason,
} from "./pro-escalation.js";

export function createFetchLlmClient(opts?: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  thinking?: boolean;
  timeoutMs?: number;
  /** 注入 bindings 以构建 strict JSON schema（skill 枚举）；未注入时回退 json_object。 */
  bindings?: AgentRuntimeBindings;
}): LlmClient {
  const apiKey = opts?.apiKey ?? process.env.LLM_API_KEY;
  const baseUrl = (
    opts?.baseUrl ??
    process.env.LLM_BASE_URL ??
    "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = opts?.model ?? process.env.LLM_MODEL ?? "deepseek-v4-flash";
  const timeoutMs = opts?.timeoutMs ?? Number.parseInt(process.env.LLM_TIMEOUT_MS ?? "15000", 10);
  const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000;

  if (!apiKey) {
    throw new LlmUnavailableError("LLM_API_KEY is not set");
  }

  const useThinking =
    opts?.thinking === true ||
    process.env.LLM_THINKING === "1" ||
    process.env.LLM_THINKING === "enabled";
  const isDeepSeekV4 =
    /deepseek/i.test(baseUrl) && /deepseek-v4|deepseek-chat|deepseek-reasoner/i.test(model);

  let accumulatedUsage: LlmUsage = {};

  const mergeUsage = (usage: LlmUsage | undefined): void => {
    if (!usage) return;
    accumulatedUsage = {
      prompt_tokens: (accumulatedUsage.prompt_tokens ?? 0) + (usage.prompt_tokens ?? 0),
      completion_tokens: (accumulatedUsage.completion_tokens ?? 0) + (usage.completion_tokens ?? 0),
      total_tokens: (accumulatedUsage.total_tokens ?? 0) + (usage.total_tokens ?? 0),
    };
  };

  const RATE_LIMIT_MAX_RETRIES = 3;

  const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  const parseRetryAfterMs = (res: Response): number | undefined => {
    const header = res.headers.get("Retry-After")?.trim();
    if (!header) return undefined;
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const dateMs = Date.parse(header);
    if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
    return undefined;
  };

  const completeChat = async (
    system: string,
    user: string,
    history: readonly LlmChatTurn[],
    jsonMode: boolean,
  ): Promise<string> => {
    const buildBody = (strictJson: boolean) => {
      const messages: { role: string; content: string }[] = [{ role: "system", content: system }];
      for (const turn of history) {
        if (!turn.content.trim()) continue;
        messages.push({
          role: turn.role,
          content: escapeUserUtteranceMarkers(turn.content.trim()),
        });
      }
      messages.push({ role: "user", content: user });
      const body: Record<string, unknown> = {
        model,
        temperature: jsonMode ? 0 : 0.3,
        messages,
      };
      if (jsonMode) {
        body.response_format = opts?.bindings
          ? intentResponseFormat(opts.bindings, strictJson)
          : { type: "json_object" };
      }
      if (isDeepSeekV4 && !useThinking) {
        body.extra_body = { thinking: { type: "disabled" } };
      }
      return body;
    };

    const tryStrict = useStrictJsonSchema();
    const request = async (strictJson: boolean) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);
      try {
        return await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildBody(strictJson)),
          signal: controller.signal,
        });
      } catch (e) {
        if (controller.signal.aborted) {
          throw new LlmUnavailableError(`LLM request timed out after ${effectiveTimeoutMs}ms`);
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }
    };

    const requestWithRateLimitRetry = async (strictJson: boolean): Promise<Response> => {
      let attempt = 0;
      while (true) {
        const res = await request(strictJson);
        if (res.status !== 429 || attempt >= RATE_LIMIT_MAX_RETRIES) {
          return res;
        }
        const retryAfterMs = parseRetryAfterMs(res) ?? Math.min(30_000, 1000 * 2 ** attempt);
        await delay(retryAfterMs);
        attempt += 1;
      }
    };

    let res = await requestWithRateLimitRetry(jsonMode && tryStrict);
    if (!res.ok && jsonMode && tryStrict) {
      res = await requestWithRateLimitRetry(false);
    }
    if (!res.ok) {
      throw new LlmUnavailableError(`LLM HTTP ${res.status}`);
    }
    const payload = (await res.json()) as {
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
      choices?: {
        message?: { content?: string; reasoning_content?: string };
      }[];
    };
    if (payload.usage) {
      mergeUsage({
        prompt_tokens: payload.usage.prompt_tokens,
        completion_tokens: payload.usage.completion_tokens,
        total_tokens: payload.usage.total_tokens,
      });
    }
    const message = payload.choices?.[0]?.message;
    const content =
      message?.content?.trim() || (useThinking ? message?.reasoning_content?.trim() : undefined);
    if (!content) throw new LlmUnavailableError("Empty LLM response");
    return content;
  };

  return {
    async completeJson(system, user, history = []) {
      return completeChat(system, user, history, true);
    },
    async completeText(system, user, history = []) {
      return completeChat(system, user, history, false);
    },
    lastUsage() {
      const hasUsage =
        accumulatedUsage.prompt_tokens !== undefined ||
        accumulatedUsage.completion_tokens !== undefined ||
        accumulatedUsage.total_tokens !== undefined;
      return hasUsage ? accumulatedUsage : undefined;
    },
    resetUsage() {
      accumulatedUsage = {};
    },
  };
}

export function extractLastJsonObject(text: string): string | undefined {
  let best: { end: number; candidate: string } | undefined;
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(start, i + 1);
          try {
            JSON.parse(candidate);
            const end = i + 1;
            if (
              !best ||
              end > best.end ||
              (end === best.end && candidate.length > best.candidate.length)
            ) {
              best = { end, candidate };
            }
          } catch {
            /* not valid JSON */
          }
          break;
        }
      }
    }
  }
  return best?.candidate;
}

function parseJsonRaw(raw: string): { ok: true; data: unknown } | { ok: false } {
  const trimmed = raw.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());
  const embedded = extractLastJsonObject(trimmed);
  if (embedded) candidates.push(embedded);
  for (const candidate of candidates) {
    try {
      return { ok: true, data: JSON.parse(candidate) };
    } catch {
      /* try next */
    }
  }
  return { ok: false };
}

function buildInvalidJsonRepairUserMessage(utterance: string): string {
  return [
    `用户原话：${escapeUserUtteranceMarkers(utterance)}`,
    "你上一句输出混入了非 JSON 文字或格式错误。",
    "请仅输出一行合法 JSON（不要 markdown、不要解释或思考过程）。",
  ].join("\n");
}

function parseStructuralOverrideIntent(
  bindings: AgentRuntimeBindings,
  text: string,
  history: readonly LlmChatTurn[],
): IntentPayload | null {
  const structural = tryStructuralIntentOverride(bindings, text, history);
  if (!structural) return null;
  const parsed = bindings.safeParseIntentPayload(structural, bindings.getEffectiveSettings());
  return parsed.success ? refineIntentFromUtterance(bindings, text, parsed.data) : null;
}

export type ResolveIntentOptions = {
  history?: readonly LlmChatTurn[];
};

function llmUsageFields(client: LlmClient): Partial<IntentLogEntry> {
  const usage = client.lastUsage?.();
  if (!usage) return {};
  return {
    ...(usage.prompt_tokens !== undefined ? { prompt_tokens: usage.prompt_tokens } : {}),
    ...(usage.completion_tokens !== undefined
      ? { completion_tokens: usage.completion_tokens }
      : {}),
    ...(usage.total_tokens !== undefined ? { total_tokens: usage.total_tokens } : {}),
  };
}

export async function resolveIntent(
  bindings: AgentRuntimeBindings,
  text: string,
  ctx: DeploymentContext,
  client: LlmClient,
  modelLabel = process.env.LLM_MODEL ?? "mock",
  opts?: ResolveIntentOptions,
): Promise<ResolveIntentResult> {
  const started = Date.now();
  const system = buildSystemPrompt(bindings, ctx);
  const history = opts?.history ?? [];
  client.resetUsage?.();
  const metrics = bindings.metrics;
  const recordLlm = (result: "success" | "failed" | "timeout"): void => {
    metrics?.incLlmCall(modelLabel, result);
    metrics?.observeLlmDuration(modelLabel, (Date.now() - started) / 1000);
  };

  try {
    let raw = await client.completeJson(system, buildUserMessage(text), history);
    let json = parseJsonRaw(raw);

    if (!json.ok) {
      const repairRaw = await client.completeJson(
        system,
        buildInvalidJsonRepairUserMessage(text),
        history,
      );
      const repairJson = parseJsonRaw(repairRaw);
      if (repairJson.ok) {
        raw = repairRaw;
        json = repairJson;
        recordIntentLog(bindings, {
          ...llmUsageFields(client),
          intent_source: "llm",
          model: modelLabel,
          latency_ms: Date.now() - started,
          raw_response: raw,
          validated: false,
          error: "invalid_json_repair_ok",
        });
      } else {
        recordIntentLog(bindings, {
          ...llmUsageFields(client),
          intent_source: "llm",
          model: modelLabel,
          latency_ms: Date.now() - started,
          raw_response: raw,
          validated: false,
          error: "invalid_json",
        });
        recordIntentFailureUnified(bindings, {
          utterance: text,
          raw_response: raw,
          error: "invalid_json",
          model: modelLabel,
        });
        return {
          ok: true,
          validation: {
            kind: "clarification",
            message: clarificationMessage("模型返回了无效 JSON"),
            repairable: true,
            zodError: "invalid_json",
          },
        };
      }
    }

    let validation = validateLlmJson(bindings, json.data);

    if (
      validation.kind === "clarification" &&
      validation.repairable &&
      validation.zodError &&
      validation.attempted !== undefined
    ) {
      const repairUser = buildSchemaRepairUserMessage({
        originalUtterance: text,
        invalidJson: validation.attempted,
        zodError: validation.zodError,
        intentContract: bindings.buildIntentContract(bindings.getEffectiveSettings()),
      });
      const repairRaw = await client.completeJson(system, repairUser, history);
      const repairJson = parseJsonRaw(repairRaw);
      if (repairJson.ok) {
        const repaired = validateLlmJson(bindings, repairJson.data);
        if (repaired.kind === "intent") {
          const intent = refineIntentFromUtterance(bindings, text, repaired.intent);
          raw = repairRaw;
          validation = {
            kind: "intent",
            intent,
          };
          recordIntentLog(bindings, {
            ...llmUsageFields(client),
            intent_source: "llm",
            model: modelLabel,
            latency_ms: Date.now() - started,
            raw_response: raw,
            validated: true,
            skill: intent.skill,
            error: "schema_repair_ok",
          });
          recordLlm("success");
          return { ok: true, validation };
        }
        validation = repaired;
        raw = repairRaw;
      }
    }

    if (validation.kind === "intent") {
      const structuralIntent = parseStructuralOverrideIntent(bindings, text, history);
      if (structuralIntent) {
        recordIntentLog(bindings, {
          ...llmUsageFields(client),
          intent_source: "llm",
          model: modelLabel,
          latency_ms: Date.now() - started,
          raw_response: raw,
          validated: true,
          skill: structuralIntent.skill,
          error: "structural_override",
        });
        recordLlm("success");
        return { ok: true, validation: { kind: "intent", intent: structuralIntent } };
      }
      validation = {
        kind: "intent",
        intent: refineIntentFromUtterance(bindings, text, validation.intent),
      };
      recordIntentLog(bindings, {
        ...llmUsageFields(client),
        intent_source: "llm",
        model: modelLabel,
        latency_ms: Date.now() - started,
        raw_response: raw,
        validated: true,
        skill: validation.intent.skill,
      });
      recordLlm("success");
      return { ok: true, validation };
    }

    const structuralIntent = parseStructuralOverrideIntent(bindings, text, history);
    if (structuralIntent) {
      recordIntentLog(bindings, {
        ...llmUsageFields(client),
        intent_source: "llm",
        model: modelLabel,
        latency_ms: Date.now() - started,
        raw_response: raw,
        validated: true,
        skill: structuralIntent.skill,
        error: "structural_override",
      });
      recordLlm("success");
      return { ok: true, validation: { kind: "intent", intent: structuralIntent } };
    }

    recordIntentLog(bindings, {
      ...llmUsageFields(client),
      intent_source: "llm",
      model: modelLabel,
      latency_ms: Date.now() - started,
      raw_response: raw,
      validated: false,
    });

    if (validation.repairable || validation.zodError) {
      recordIntentFailureUnified(bindings, {
        utterance: text,
        raw_response: raw,
        error: validation.zodError ?? "schema_repair_failed",
        model: modelLabel,
      });
    }
    recordLlm("failed");
    return { ok: true, validation };
  } catch (e) {
    recordIntentLog(bindings, {
      ...llmUsageFields(client),
      intent_source: "llm",
      model: modelLabel,
      latency_ms: Date.now() - started,
      raw_response: "",
      validated: false,
      error: e instanceof Error ? e.message : String(e),
    });
    const isTimeout = e instanceof Error && /timed out/i.test(e.message);
    recordLlm(isTimeout ? "timeout" : "failed");
    return {
      ok: false,
      unavailable: true,
      message: serviceUnavailableMessage(),
    };
  }
}
