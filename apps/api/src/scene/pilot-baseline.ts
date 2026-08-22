import { existsSync, readFileSync } from "node:fs";
import { deploymentScopedPath } from "../fs/deployment-path.js";
import { atomicWriteJson } from "@embodied-agent/platform";

const FILE = "pilot-baseline.json";

export type PilotBaseline = {
  deployment_id: string;
  manual_run_shed_count_per_week?: number;
  notes?: string;
  updated_at: string;
};

function baselinePath(deployment_id: string): string {
  return deploymentScopedPath(FILE, deployment_id);
}

export function getPilotBaseline(deployment_id: string): PilotBaseline | null {
  const path = baselinePath(deployment_id);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PilotBaseline;
  } catch {
    return null;
  }
}

export function savePilotBaseline(
  deployment_id: string,
  patch: {
    manual_run_shed_count_per_week?: number;
    notes?: string;
  },
): PilotBaseline {
  const prev = getPilotBaseline(deployment_id);
  const row: PilotBaseline = {
    deployment_id,
    manual_run_shed_count_per_week:
      patch.manual_run_shed_count_per_week ?? prev?.manual_run_shed_count_per_week,
    notes: patch.notes ?? prev?.notes,
    updated_at: new Date().toISOString(),
  };
  atomicWriteJson(baselinePath(deployment_id), row);
  return row;
}
