import type { DomainPackIntentProcessing, IntentPayload } from "@embodied-agent/core";
import { INDUSTRIAL_PHYSICAL_SKILLS } from "../skills.js";

const CONTROL_SKILLS = new Set<string>(INDUSTRIAL_PHYSICAL_SKILLS);
const CROSS_DOMAIN_HINT = /(?:greenhouse|agriculture|robot|m20|机器狗|大棚|棚)/i;
const DURATION_MIN_RE = /(?:持续|时长|持续时间).{0,8}(\d+)\s*(?:分钟|分|min|minutes?)/i;
const QUERY_HINT = /(?:状态|温度|多少|几|开了吗|运行吗|是否)/;

function durationSecondsFromText(text: string): number | undefined {
  const match = DURATION_MIN_RE.exec(text);
  if (!match) return undefined;
  const minutes = Number(match[1]);
  return Number.isFinite(minutes) ? Math.round(minutes * 60) : undefined;
}

function normalizeTarget(target: unknown): Record<string, unknown> {
  if (!target || typeof target !== "object") {
    return {};
  }
  const out = { ...(target as Record<string, unknown>) };
  if (typeof out.cabinet_id !== "string" || !out.cabinet_id.trim()) {
    delete out.cabinet_id;
  } else {
    out.cabinet_id = out.cabinet_id.trim();
  }
  return out;
}

function industrialDisambiguationRules(deploymentTarget: string): string {
  return `规则：
1. 将用户消息映射为 industrial.* skill、target、parameters；禁止输出无关平台字段。
2. 目标配电柜优先使用 domain_configs.industrial.default_cabinet_id；当前部署目标为 ${deploymentTarget}。
3. industrial.start_exhaust / industrial.stop_exhaust 用于过温排风；duration_seconds 必须是 60-3600 的整数。
4. 用户只说“排风一下/开排风/停排风/看温度/查状态”时，可分别映射到 start_exhaust、stop_exhaust、query_status。
5. greenhouse、robot、M20、机器狗、大棚等跨域词汇不属于工业场景，必须追问澄清。`;
}

function industrialExamples(_deploymentTarget: string): string {
  return `示例（只输出 JSON）：
{"skill":"industrial.query_status","target":{"cabinet_id":"cabinet-001"},"confidence":0.95}
{"skill":"industrial.start_exhaust","target":{"cabinet_id":"cabinet-001"},"parameters":{"duration_seconds":600},"confidence":0.95}
{"skill":"industrial.stop_exhaust","target":{"cabinet_id":"cabinet-001"},"confidence":0.95}
{"skill":"command.query_status","target":{"cabinet_id":"cabinet-001"},"parameters":{"action":"start_exhaust"},"confidence":0.9}`;
}

function refineIndustrialIntentFromUtterance(
  utterance: string,
  intent: IntentPayload,
): IntentPayload {
  const text = utterance.trim();
  if (CROSS_DOMAIN_HINT.test(text)) {
    return {
      skill: "clarification_needed",
      target: {},
      clarification: "当前启用的是 industrial 场景，请改为工业过温排风相关指令。",
    } as IntentPayload;
  }
  if (intent.skill === "industrial.start_exhaust") {
    const duration = durationSecondsFromText(text);
    if (duration && duration > 3600) {
      return {
        skill: "clarification_needed",
        target: {},
        clarification: "排风时长不能超过 3600 秒，请缩短后重试。",
      } as IntentPayload;
    }
    if (duration && duration >= 60) {
      return {
        ...intent,
        parameters: { ...(intent.parameters ?? {}), duration_seconds: duration },
      } as IntentPayload;
    }
  }
  if (intent.skill === "industrial.query_status" || intent.skill === "industrial.stop_exhaust") {
    if (QUERY_HINT.test(text) || intent.skill === "industrial.stop_exhaust") return intent;
  }
  return intent;
}

function normalizeIndustrialLlmShape(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const raw = data as Record<string, unknown>;
  const out: Record<string, unknown> = { ...raw };
  out.target = normalizeTarget(out.target);
  if (out.parameters && typeof out.parameters === "object") {
    const params = { ...(out.parameters as Record<string, unknown>) };
    if (typeof params.duration_minutes === "number") {
      params.duration_seconds = Math.round(params.duration_minutes * 60);
      delete params.duration_minutes;
    }
    if (typeof params.duration === "number" && params.duration_seconds === undefined) {
      params.duration_seconds = Math.round(params.duration * 60);
      delete params.duration;
    }
    if (typeof params.duration_seconds === "string") {
      params.duration_seconds = Number.parseInt(params.duration_seconds, 10);
    }
    out.parameters = params;
  }
  return out;
}

export const INDUSTRIAL_INTENT_PROCESSING: DomainPackIntentProcessing = {
  prompt: {
    parserPreamble:
      "你是具身 Agent「工业安能卫士」的意图解析器。只输出一行 JSON，禁止 markdown、解释或思考过程。",
    clarificationRule:
      '当目标配电柜未指明且没有可用默认配置时，或用户意图含糊时，skill 设为 "clarification_needed" 并用中文追问。',
    disambiguationRules: industrialDisambiguationRules,
    examples: industrialExamples,
  },
  normalizeUtterance: (text) => text.trim(),
  normalizeLlmShape: normalizeIndustrialLlmShape,
  refineIntentFromUtterance: refineIndustrialIntentFromUtterance,
  detectSkillUtteranceConflict: (utterance, skill) =>
    skill === "industrial.query_status" &&
    /(?:停止|关闭|停掉|关掉).{0,6}(?:排风|通风)|(?:排风|通风).{0,6}(?:停止|关闭|停掉|关掉)/.test(
      utterance,
    ),
  isLowConfidenceControlSkill: (skill) => CONTROL_SKILLS.has(skill),
};
