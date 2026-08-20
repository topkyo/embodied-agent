import type { CommandRecord } from "../commands/types.js";
import type { TelemetrySnapshot } from "../commands/telemetry-snapshot.js";
import { upsertSceneOutcomeByCommand } from "./outcome-store.js";
import { evaluateActiveDomainOutcomeSuccess } from "@embodied-agent/runtime";
import { isSceneSkillId, type SceneSkillId } from "./registry.js";
import { getPlatformRuntimeContext } from "../runtime/context.js";

function pickAfterSnapshot(record: CommandRecord): {
  snapshot?: TelemetrySnapshot;
  window_minutes: number;
} {
  const windows = record.telemetry_flywheel?.windows ?? [];
  if (windows.length > 0) {
    const best = [...windows].sort((a, b) => b.minutes - a.minutes)[0]!;
    return { snapshot: best.snapshot, window_minutes: best.minutes };
  }
  return {
    snapshot: record.telemetry_flywheel?.after,
    window_minutes: 0,
  };
}

function deltaTemperature(
  before: TelemetrySnapshot | undefined,
  after: TelemetrySnapshot | undefined,
): number | undefined {
  if (typeof before?.temperature_c !== "number" || typeof after?.temperature_c !== "number") {
    return undefined;
  }
  return after.temperature_c - before.temperature_c;
}

function deltaHumidity(
  before: TelemetrySnapshot | undefined,
  after: TelemetrySnapshot | undefined,
): number | undefined {
  if (typeof before?.humidity_percent !== "number" || typeof after?.humidity_percent !== "number") {
    return undefined;
  }
  return after.humidity_percent - before.humidity_percent;
}

export function evaluateOutcomeSuccess(
  scene_skill_id: SceneSkillId,
  record: CommandRecord,
  after?: TelemetrySnapshot,
): boolean {
  const before = record.telemetry_flywheel?.before;
  const picked = pickAfterSnapshot(record);
  const afterSnap = after ?? picked.snapshot;
  return evaluateActiveDomainOutcomeSuccess(getPlatformRuntimeContext(), {
    scene_skill_id,
    command_status: record.status,
    before,
    after: afterSnap,
    window_minutes: picked.window_minutes,
  });
}

export function evaluateSceneOutcomeFromCommand(
  record: CommandRecord,
): ReturnType<typeof upsertSceneOutcomeByCommand> | null {
  const scene_skill_id = record.scene_skill_id;
  if (!scene_skill_id || !isSceneSkillId(scene_skill_id)) return null;
  if (record.status !== "completed") return null;

  const { snapshot: afterSnap, window_minutes } = pickAfterSnapshot(record);
  if (!afterSnap) return null;
  const before = record.telemetry_flywheel?.before;
  const temperature_delta_c = deltaTemperature(before, afterSnap);
  const humidity_delta_percent = deltaHumidity(before, afterSnap);
  const success = evaluateOutcomeSuccess(scene_skill_id, record, afterSnap);

  return upsertSceneOutcomeByCommand({
    deployment_id: record.command.deployment_id,
    scene_skill_id,
    command_id: record.command_id,
    entity_id: afterSnap.entity_id,
    success,
    evaluation_window_minutes: window_minutes,
    user_confirmed: record.user_confirmed,
    metrics: {
      action: record.command.action,
      device_id: record.command.device_id,
      status: record.status,
      evaluation_window_minutes: window_minutes,
      temperature_delta_c,
      humidity_delta_percent,
    },
  });
}
