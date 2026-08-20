import { createLogger } from "@embodied-agent/platform";
import { listOperationLogs } from "../db/log.js";

import { getAllTelemetry } from "../telemetry/store.js";
import { listAlertRules, formatAlertRule } from "../alerts/threshold-store.js";
import { createSceneOpsLlmClient } from "../scene/llm-model.js";
import { getEffectiveSettings } from "../settings/store.js";
import { activeWeeklyAdvice } from "@embodied-agent/runtime";
import type { SceneTelemetrySlice } from "@embodied-agent/core";
import { aggregateSceneOutcomes } from "../scene/outcome-store.js";
import { getPilotBaseline } from "../scene/pilot-baseline.js";
import { buildPilotRoiSummary } from "../scene/roi-report.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";
import { generatePolicySuggestions, listPolicySuggestions } from "../scene/policy-suggestions.js";

const log = createLogger("weekly-advice");
function logsLast7Days(): ReturnType<typeof listOperationLogs> {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return listOperationLogs().filter((l) => new Date(l.ts).getTime() >= cutoff);
}

function getSceneTelemetry(deploymentId: string): SceneTelemetrySlice[] {
  return getAllTelemetry(deploymentId).map((t) => ({ ...t, entity_id: t.entity_id }));
}

export async function buildWeeklyAdviceText(deployment_id: string): Promise<string> {
  const settings = getEffectiveSettings();
  if (!settings.llm_api_key) {
    throw new Error("周报建议需要配置 LLM API Key。");
  }
  const weeklyAdvice = activeWeeklyAdvice(getPlatformRuntimeContext());
  if (!weeklyAdvice) {
    throw new Error("当前 Domain Pack 未提供 weeklyAdvice。");
  }

  const telemetry = getSceneTelemetry(deployment_id);
  const rules = listAlertRules(deployment_id);
  const recentLogs = logsLast7Days().slice(-40);

  generatePolicySuggestions(deployment_id);
  const roi = buildPilotRoiSummary(deployment_id, 7);
  const pendingSuggestions = listPolicySuggestions(deployment_id, "pending");
  const outcomes = aggregateSceneOutcomes(deployment_id, 7);
  const baseline = getPilotBaseline(deployment_id);
  const outcomeSummary =
    outcomes.total > 0
      ? `近7天场景复盘 ${outcomes.success_count}/${outcomes.total} 次达标；` +
        Object.entries(outcomes.by_scene)
          .map(([id, s]) => `${id} ${s.success}/${s.total}`)
          .join("；")
      : "近7天暂无场景复盘记录。";
  const baselineSummary = baseline?.manual_run_shed_count_per_week
    ? `试点基线：每周人工巡检约 ${baseline.manual_run_shed_count_per_week} 次。`
    : "";

  const suggestionSummary =
    pendingSuggestions.length > 0
      ? pendingSuggestions
          .map((s, i) => `${i + 1}. ${s.reason}（可说「采纳策略建议 ${i + 1}」）`)
          .join("\n")
      : undefined;
  const input = {
    deploymentId: deployment_id,
    pilotRoiSummary: roi.summary_text,
    sceneOutcomesSummary: outcomeSummary,
    pilotBaseline: baselineSummary || undefined,
    policySuggestions: suggestionSummary,
    telemetry,
    alertRules: rules.map(formatAlertRule),
    recentOperations: recentLogs.map((l) => `${l.ts.slice(0, 16)} ${l.skill} ${l.result}`),
  };

  const client = createSceneOpsLlmClient(settings);
  const user = weeklyAdvice.buildUserPrompt(input);

  try {
    const text = await client.completeText(weeklyAdvice.systemPrompt, user);
    return text.trim();
  } catch (e) {
    log.warn("weekly advice LLM failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
