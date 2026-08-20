import { getMemoryJournal } from "../memory/journal.js";
import type { SceneSkillId } from "./registry.js";

export type SceneOutcome = {
  ts: string;
  deployment_id: string;
  scene_skill_id: SceneSkillId;
  command_id?: string;
  entity_id?: string;
  success: boolean;
  evaluation_window_minutes?: number;
  user_confirmed?: boolean;
  metrics: Record<string, unknown>;
};

export function appendSceneOutcome(
  event: Omit<SceneOutcome, "ts"> & { ts?: string },
): SceneOutcome {
  const { ts: explicitTs, ...rest } = event;
  const row: SceneOutcome = {
    ...rest,
    ts: explicitTs ?? new Date().toISOString(),
  };
  getMemoryJournal().appendOutcome(rest.deployment_id, row);
  return row;
}

export function upsertSceneOutcomeByCommand(
  event: Omit<SceneOutcome, "ts"> & { command_id: string },
): SceneOutcome {
  const lines = getMemoryJournal().readOutcomeLines(event.deployment_id);
  let found = false;
  let ts = new Date().toISOString();
  const out: string[] = [];
  for (const line of lines) {
    try {
      const row = JSON.parse(line) as SceneOutcome;
      if (row.command_id === event.command_id) {
        if (!found) {
          found = true;
          ts = row.ts;
          out.push(JSON.stringify({ ts, ...event }));
        }
        continue;
      }
      out.push(line);
    } catch (e) {
      throw new Error(
        `scene outcome line 无法读取或校验失败：${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
    }
  }
  const row: SceneOutcome = { ts, ...event };
  if (!found) out.push(JSON.stringify(row));
  getMemoryJournal().writeOutcomeLines(event.deployment_id, out);
  return row;
}

function dedupeOutcomesByCommandId(rows: SceneOutcome[]): SceneOutcome[] {
  const lastIdx = new Map<string, number>();
  rows.forEach((row, i) => {
    if (row.command_id) lastIdx.set(row.command_id, i);
  });
  return rows.filter((row, i) => !row.command_id || lastIdx.get(row.command_id) === i);
}

export function listSceneOutcomes(
  deployment_id: string,
  opts?: { limit?: number; since_days?: number },
): SceneOutcome[] {
  const limit = opts?.limit ?? 100;
  const sinceMs = opts?.since_days ? Date.now() - opts.since_days * 24 * 60 * 60 * 1000 : 0;
  const rows: SceneOutcome[] = [];
  for (const line of getMemoryJournal().readOutcomeLines(deployment_id)) {
    try {
      const row = JSON.parse(line) as SceneOutcome;
      if (sinceMs && new Date(row.ts).getTime() < sinceMs) continue;
      rows.push(row);
    } catch (e) {
      throw new Error(
        `scene outcome line 无法读取或校验失败：${e instanceof Error ? e.message : String(e)}`,
        { cause: e },
      );
    }
  }
  return dedupeOutcomesByCommandId(rows).slice(-limit);
}

export function aggregateSceneOutcomes(
  deployment_id: string,
  since_days = 7,
): {
  total: number;
  success_count: number;
  by_scene: Record<string, { total: number; success: number }>;
} {
  const rows = listSceneOutcomes(deployment_id, { since_days, limit: Number.MAX_SAFE_INTEGER });
  const by_scene: Record<string, { total: number; success: number }> = {};
  let success_count = 0;
  for (const row of rows) {
    const bucket = by_scene[row.scene_skill_id] ?? { total: 0, success: 0 };
    bucket.total += 1;
    if (row.success) {
      bucket.success += 1;
      success_count += 1;
    }
    by_scene[row.scene_skill_id] = bucket;
  }
  return { total: rows.length, success_count, by_scene };
}

export function aggregateSceneOutcomesByEntity(
  deployment_id: string,
  scene_skill_id: SceneSkillId,
  since_days = 7,
): Record<string, { total: number; success: number }> {
  const rows = listSceneOutcomes(deployment_id, {
    since_days,
    limit: Number.MAX_SAFE_INTEGER,
  }).filter((r) => r.scene_skill_id === scene_skill_id);
  const by_entity: Record<string, { total: number; success: number }> = {};
  for (const row of rows) {
    if (!row.entity_id) continue;
    const entity_id = row.entity_id;
    const bucket = by_entity[entity_id] ?? { total: 0, success: 0 };
    bucket.total += 1;
    if (row.success) bucket.success += 1;
    by_entity[entity_id] = bucket;
  }
  return by_entity;
}

export function aggregateSceneOutcomesAllDeployments(
  deployment_ids: string[],
  since_days = 7,
): {
  deployments: Record<string, ReturnType<typeof aggregateSceneOutcomes>>;
  total: number;
  success_count: number;
} {
  const deployments: Record<string, ReturnType<typeof aggregateSceneOutcomes>> = {};
  let total = 0;
  let success_count = 0;
  for (const deployment_id of deployment_ids) {
    const agg = aggregateSceneOutcomes(deployment_id, since_days);
    deployments[deployment_id] = agg;
    total += agg.total;
    success_count += agg.success_count;
  }
  return { deployments, total, success_count };
}

export function clearSceneOutcomesForTest(deployment_id: string): void {
  getMemoryJournal().writeOutcomeLines(deployment_id, []);
}
