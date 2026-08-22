import { getAllTelemetry } from "../telemetry/store.js";
import { queryLogsToday } from "../db/log.js";
import { activeDigest, getSceneMode } from "@embodied-agent/runtime";
import type { SceneTelemetrySlice } from "@embodied-agent/core";
import { getPlatformRuntimeContext } from "../runtime/context.js";

export type DigestSlot = "morning" | "evening";

function getSceneTelemetry(deploymentId: string): SceneTelemetrySlice[] {
  return getAllTelemetry(deploymentId).map((t) => ({ ...t, entity_id: t.entity_id }));
}

export function buildDigestMessage(
  slot: DigestSlot,
  deploymentName: string,
  deploymentId: string,
): string {
  const ctx = getPlatformRuntimeContext();
  const digest = activeDigest(ctx);
  if (!digest) {
    throw new Error("当前 Domain Pack 未提供 digest。");
  }
  return digest.buildMessage({
    slot,
    deploymentName,
    deploymentId,
    services: {
      getAllTelemetry: () => getSceneTelemetry(deploymentId),
      getModeByEntityId: (entityId: string) => getSceneMode(ctx, entityId),
      queryLogsToday,
    },
  });
}
