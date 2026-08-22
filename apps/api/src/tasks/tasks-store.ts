import { readFileSync, existsSync } from "node:fs";
import { atomicWriteJson } from "@embodied-agent/platform";
import { deploymentScopedPath } from "../fs/deployment-path.js";

export type SceneTaskStatus = "pending" | "done";

export type SceneTask = {
  task_id: string;
  deployment_id: string;
  title: string;
  status: SceneTaskStatus;
  created_at: string;
  created_by: string;
  due_date?: string;
  entity_id?: string;
};

function tasksPath(deployment_id: string): string {
  return deploymentScopedPath("scene-tasks.json", deployment_id);
}

function loadAll(deployment_id: string): SceneTask[] {
  const path = tasksPath(deployment_id);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as SceneTask[];
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    throw new Error(`scene-tasks.json 无法读取：${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}

function saveAll(deployment_id: string, tasks: SceneTask[]): void {
  atomicWriteJson(tasksPath(deployment_id), tasks);
}

export function createSceneTask(input: {
  deployment_id: string;
  title: string;
  created_by: string;
  due_date?: string;
  entity_id?: string;
}): SceneTask {
  const task: SceneTask = {
    task_id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    deployment_id: input.deployment_id,
    title: input.title.trim(),
    status: "pending",
    created_at: new Date().toISOString(),
    created_by: input.created_by,
    due_date: input.due_date,
    entity_id: input.entity_id,
  };
  const all = loadAll(input.deployment_id);
  all.push(task);
  saveAll(input.deployment_id, all);
  return task;
}

export function listSceneTasks(
  deployment_id: string,
  status: "pending" | "done" | "all" = "all",
): SceneTask[] {
  return loadAll(deployment_id)
    .filter((t) => t.deployment_id === deployment_id)
    .filter((t) => status === "all" || t.status === status)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
