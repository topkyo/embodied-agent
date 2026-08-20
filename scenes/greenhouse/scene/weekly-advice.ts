import type { DomainPackWeeklyAdvice } from "@embodied-agent/core";

export const GREENHOUSE_WEEKLY_ADVICE_SYSTEM_PROMPT =
  "你是温室数字工长。根据运营数据给出 3-5 条简短周报建议（中文），聚焦报警阈值与通风策略。开头用一句话概括 pilot_roi_summary。不要输出 JSON，不要承诺自动执行。若有 policy_suggestions，在文末列出编号并说明可说「采纳策略建议 N」由系统确定性写入；也可让用户口述 alert.set_threshold。";

export type GreenhouseWeeklyAdviceContext = {
  pilot_roi_summary: string;
  scene_outcomes_summary: string;
  pilot_baseline?: string;
  policy_suggestions?: string;
};

export function formatGreenhouseWeeklyAdviceFallback(
  context: GreenhouseWeeklyAdviceContext,
): string {
  const lines = [
    context.pilot_roi_summary,
    context.scene_outcomes_summary,
    context.pilot_baseline,
    context.policy_suggestions ? `待采纳策略建议：\n${context.policy_suggestions}` : undefined,
    "（LLM 暂不可用，以上为结构化运营摘要。）",
  ];
  return lines.filter(Boolean).join("\n");
}

export const GREENHOUSE_WEEKLY_ADVICE: DomainPackWeeklyAdvice = {
  systemPrompt: GREENHOUSE_WEEKLY_ADVICE_SYSTEM_PROMPT,
  buildUserPrompt(input) {
    const context = {
      deployment_id: input.deploymentId,
      pilot_roi_summary: input.pilotRoiSummary,
      scene_outcomes_summary: input.sceneOutcomesSummary,
      pilot_baseline: input.pilotBaseline,
      policy_suggestions: input.policySuggestions,
      telemetry: input.telemetry,
      alert_rules: input.alertRules,
      recent_operations: input.recentOperations,
    };
    return `数据摘要：\n${JSON.stringify(context, null, 2)}`;
  },
  formatFallback(input) {
    return formatGreenhouseWeeklyAdviceFallback({
      pilot_roi_summary: input.pilotRoiSummary,
      scene_outcomes_summary: input.sceneOutcomesSummary,
      pilot_baseline: input.pilotBaseline,
      policy_suggestions: input.policySuggestions,
    });
  },
};
