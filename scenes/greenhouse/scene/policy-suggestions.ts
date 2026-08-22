import type {
  DomainPackPolicyAlertRule,
  DomainPackPolicyAlertRuleUpdate,
  DomainPackPolicySuggestions,
  IntentPayload,
} from "@embodied-agent/core";
import type { SceneSkillId } from "./registry.js";

export type GreenhousePolicySuggestionKind = "alert_threshold" | "night_vent_mode";

type GreenhousePolicyMetric = "temperature_c" | "humidity_percent";

export type GreenhouseAlertRule = DomainPackPolicyAlertRule & {
  metric: GreenhousePolicyMetric;
};

type GreenhouseThresholdIntent = IntentPayload & {
  target: {
    greenhouse_id: string;
  };
  parameters: {
    metric: GreenhousePolicyMetric;
    operator: ">" | ">=";
    value: number;
  };
};

function toGreenhousePolicyMetric(metric: string): GreenhousePolicyMetric {
  if (metric === "temperature_c" || metric === "humidity_percent") return metric;
  throw new Error(`unsupported greenhouse policy suggestion metric: ${metric}`);
}

function toGreenhouseRule(rule: DomainPackPolicyAlertRule): GreenhouseAlertRule {
  return {
    ...rule,
    metric: toGreenhousePolicyMetric(rule.metric),
  };
}

function asGreenhouseThresholdIntent(intent: IntentPayload): GreenhouseThresholdIntent {
  const target = intent.target as Record<string, unknown> | undefined;
  const parameters = intent.parameters as Record<string, unknown> | undefined;
  if (
    typeof target?.greenhouse_id !== "string" ||
    typeof parameters?.metric !== "string" ||
    (parameters.operator !== ">" && parameters.operator !== ">=") ||
    typeof parameters.value !== "number"
  ) {
    throw new Error("greenhouse policy suggestion intent 缺少阈值写入字段。");
  }
  return {
    ...intent,
    target: { greenhouse_id: target.greenhouse_id },
    parameters: {
      metric: toGreenhousePolicyMetric(parameters.metric),
      operator: parameters.operator,
      value: parameters.value,
    },
  };
}

function buildGreenhouseAlertRuleUpdate(
  intent: IntentPayload,
): DomainPackPolicyAlertRuleUpdate | null {
  if (intent.skill !== "alert.set_threshold") return null;
  const threshold = asGreenhouseThresholdIntent(intent);
  return {
    entity_id: threshold.target.greenhouse_id,
    metric: threshold.parameters.metric,
    operator: threshold.parameters.operator,
    value: threshold.parameters.value,
  };
}

export type GreenhouseOutcomeStats = {
  success: number;
  total: number;
};

export type GreenhousePolicySuggestionDraft = {
  kind: GreenhousePolicySuggestionKind;
  sceneSkillId?: SceneSkillId;
  reason: string;
  intent: IntentPayload;
};

export function buildGreenhousePolicySuggestionDrafts(input: {
  rules: readonly GreenhouseAlertRule[];
  nightVentOutcomesByGreenhouse: Record<string, GreenhouseOutcomeStats | undefined>;
  humidityOutcomesByGreenhouse: Record<string, GreenhouseOutcomeStats | undefined>;
}): GreenhousePolicySuggestionDraft[] {
  const drafts: GreenhousePolicySuggestionDraft[] = [];

  for (const rule of input.rules) {
    if (rule.metric !== "temperature_c" || rule.operator !== ">" || rule.value <= 29) {
      continue;
    }
    const ghStats = input.nightVentOutcomesByGreenhouse[rule.entity_id];
    if (!ghStats || ghStats.success < 3) continue;

    const nextValue = Math.max(29, rule.value - 1);
    drafts.push({
      kind: "alert_threshold",
      sceneSkillId: "night_ventilation_control",
      reason: `${rule.entity_id} 近 7 天夜间通风达标 ${ghStats.success} 次，建议将高温报警阈值从 ${rule.value}°C 调至 ${nextValue}°C。`,
      intent: {
        skill: "alert.set_threshold",
        target: { greenhouse_id: rule.entity_id },
        parameters: {
          metric: "temperature_c",
          operator: ">",
          value: nextValue,
        },
        confidence: 0.85,
      },
    });
  }

  for (const rule of input.rules) {
    if (rule.metric !== "humidity_percent" || rule.operator !== ">" || rule.value <= 80) {
      continue;
    }
    const ghStats = input.humidityOutcomesByGreenhouse[rule.entity_id];
    if (!ghStats || ghStats.success < 2) continue;

    drafts.push({
      kind: "alert_threshold",
      sceneSkillId: "humidity_mildew_prevention",
      reason: `${rule.entity_id} 高湿通风达标 ${ghStats.success} 次，建议将湿度报警阈值设为 80%。`,
      intent: {
        skill: "alert.set_threshold",
        target: { greenhouse_id: rule.entity_id },
        parameters: {
          metric: "humidity_percent",
          operator: ">",
          value: 80,
        },
        confidence: 0.85,
      },
    });
  }

  return drafts;
}

export const GREENHOUSE_POLICY_SUGGESTIONS: DomainPackPolicySuggestions = {
  buildDrafts({ alertRules, services }) {
    return buildGreenhousePolicySuggestionDrafts({
      rules: alertRules.map(toGreenhouseRule),
      nightVentOutcomesByGreenhouse: services.outcomeStatsByScene("night_ventilation_control", 7),
      humidityOutcomesByGreenhouse: services.outcomeStatsByScene("humidity_mildew_prevention", 7),
    });
  },
  buildAlertRuleUpdate(intent) {
    return buildGreenhouseAlertRuleUpdate(intent);
  },
};
