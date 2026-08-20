import { activeSceneRuntime } from "@embodied-agent/runtime";
import { aggregateSceneOutcomes } from "./outcome-store.js";
import { getPilotBaseline } from "./pilot-baseline.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";

export type PilotRoiSummary = {
  deployment_id: string;
  baseline_runs_per_week?: number;
  scene_total: number;
  scene_success_count: number;
  estimated_runs_saved: number;
  summary_text: string;
};

function runSavingSceneIds(): Set<string> {
  const runtime = activeSceneRuntime(getPlatformRuntimeContext());
  if (!runtime) return new Set();
  return new Set(runtime.sceneSkillIds);
}

export function buildPilotRoiSummary(deployment_id: string, since_days = 7): PilotRoiSummary {
  const outcomes = aggregateSceneOutcomes(deployment_id, since_days);
  const baseline = getPilotBaseline(deployment_id);
  const runSavingScenes = runSavingSceneIds();
  let estimated_runs_saved = 0;
  for (const [scene, bucket] of Object.entries(outcomes.by_scene)) {
    if (runSavingScenes.has(scene)) {
      estimated_runs_saved += bucket.success;
    }
  }
  if (baseline?.manual_run_shed_count_per_week !== undefined) {
    estimated_runs_saved = Math.min(estimated_runs_saved, baseline.manual_run_shed_count_per_week);
  }

  const rate = outcomes.total > 0 ? Math.round((outcomes.success_count / outcomes.total) * 100) : 0;
  const baselinePart = baseline?.manual_run_shed_count_per_week
    ? `试点基线每周跑棚约 ${baseline.manual_run_shed_count_per_week} 次；`
    : "";
  const savedPart =
    estimated_runs_saved > 0
      ? `近 ${since_days} 天场景达标约减少跑棚 ${estimated_runs_saved} 次；`
      : "近期待更多场景复盘数据估算跑棚收益；";
  const summary_text = `${baselinePart}场景复盘 ${outcomes.success_count}/${outcomes.total} 次达标（${rate}%）。${savedPart}`;

  return {
    deployment_id,
    baseline_runs_per_week: baseline?.manual_run_shed_count_per_week,
    scene_total: outcomes.total,
    scene_success_count: outcomes.success_count,
    estimated_runs_saved,
    summary_text,
  };
}
