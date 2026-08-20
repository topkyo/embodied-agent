import type { DomainPackSkillHandlerResult, IntentPayload } from "@embodied-agent/core";

type AlertRule = {
  entity_id: string;
  metric: "temperature_c" | "humidity_percent";
  operator: ">" | "<" | ">=" | "<=";
  value: number;
  enabled?: boolean;
  updated_at?: string;
  updated_by?: string;
};

type AlertRuleServices = {
  filter?: (greenhouseId?: string) => AlertRule[];
  format?: (rule: AlertRule) => string;
};

const ALERT_SKILLS = new Set([
  "alert.set_threshold",
  "alert.query_threshold",
  "alert.clear_threshold",
]);

export function canHandleGreenhouseAlertSkill(intent: IntentPayload): boolean {
  return ALERT_SKILLS.has(intent.skill);
}

function alertRuleServices(context: { services?: Record<string, unknown> }): AlertRuleServices {
  const value = context.services?.alertRules;
  return value && typeof value === "object" ? (value as AlertRuleServices) : {};
}

function formatAlertRule(rule: AlertRule): string {
  const metricLabel = rule.metric === "temperature_c" ? "温度" : "湿度";
  const unit = rule.metric === "temperature_c" ? "°C" : "%";
  return `${rule.entity_id} ${metricLabel} ${rule.operator} ${rule.value}${unit}`;
}

export async function handleGreenhouseAlertSkill(
  intent: IntentPayload,
  context: {
    domainConfig?: unknown;
    deploymentId: string;
    userId?: string;
    services?: Record<string, unknown>;
  },
): Promise<DomainPackSkillHandlerResult> {
  const target = intent.target as { greenhouse_id?: string };
  const params = intent.parameters as {
    metric?: string;
    operator?: string;
    value?: number;
  };
  if (intent.skill === "alert.set_threshold") {
    return {
      reply: `已设置 ${target.greenhouse_id} 报警阈值：${params.metric} ${params.operator} ${params.value}。`,
      params: { ...intent.parameters, entity_id: target.greenhouse_id },
    };
  }

  if (intent.skill === "alert.query_threshold") {
    const gh = target.greenhouse_id;
    const alertRules = alertRuleServices(context);
    const rules = alertRules.filter?.(gh) ?? [];
    if (rules.length === 0) {
      return {
        reply: gh ? `${gh} 当前没有启用的报警阈值。` : "当前没有启用的报警阈值。",
        params: { entity_id: gh, count: 0 },
      };
    }
    const formatter = alertRules.format ?? formatAlertRule;
    const lines = rules.map(formatter);
    return {
      reply: `当前报警阈值：\n${lines.join("\n")}`,
      params: { entity_id: gh, count: rules.length, rules },
    };
  }

  if (intent.skill === "alert.clear_threshold") {
    return {
      reply: params.metric
        ? `已清除 ${target.greenhouse_id} 的 ${params.metric} 报警阈值。`
        : `已清除 ${target.greenhouse_id} 的全部报警阈值。`,
      params: {
        entity_id: target.greenhouse_id,
        metric: params.metric,
      },
    };
  }

  return { reply: "暂不支持该报警技能。", params: {} };
}
