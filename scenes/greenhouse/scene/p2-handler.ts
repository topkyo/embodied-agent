import type { DomainPackSkillHandlerResult, IntentPayload } from "@embodied-agent/core";

type GreenhouseSkillHandlerContext = {
  domainConfig?: unknown;
  deploymentId: string;
  userId?: string;
  services?: Record<string, unknown>;
};

type SatelliteNdviService = {
  resolvePlot(opts: { plot_id?: string; entity_id?: string }): unknown;
  fetchForPlot(plot: unknown): Promise<unknown>;
  formatReply(plot: unknown, entry: unknown): string;
};

type AgronomyPestsService = {
  formatReply(query: string): string;
};

type SceneTasksService = {
  create(input: {
    deployment_id: string;
    title: string;
    created_by: string;
    due_date?: string;
    entity_id?: string;
  }): {
    task_id: string;
    title: string;
    status: string;
    due_date?: string;
    entity_id?: string;
  };
  list(
    deployment_id: string,
    status: "pending" | "done" | "all",
  ): Array<{
    title: string;
    status: string;
    due_date?: string;
    entity_id?: string;
  }>;
};

type WeeklyAdviceService = {
  buildText(deployment_id: string): Promise<string>;
};

type PolicySuggestionsService = {
  list(
    deployment_id: string,
    status: "pending",
  ): Array<{
    id: string;
    reason: string;
    scene_skill_id?: string;
    kind: string;
  }>;
  apply(
    deployment_id: string,
    suggestion_id: string,
    user_id: string,
  ):
    | {
        ok: true;
        suggestion: {
          id: string;
          reason: string;
          scene_skill_id?: string;
          kind: string;
        };
      }
    | { ok: false; error: string };
};

const P2_SKILLS = new Set([
  "satellite.query_ndvi",
  "agronomy.query_pest",
  "tasks.query_task",
  "tasks.create_task",
  "advice.query_weekly",
  "policy.apply_suggestion",
]);

export function canHandleGreenhouseP2Skill(intent: IntentPayload): boolean {
  return P2_SKILLS.has(intent.skill);
}

function requireDeploymentId(context: GreenhouseSkillHandlerContext): string {
  if (!context.deploymentId?.trim()) {
    throw new Error("greenhouse P2 skill 缺少 deploymentId。");
  }
  return context.deploymentId;
}

function requireUserId(context: GreenhouseSkillHandlerContext): string {
  if (!context.userId?.trim()) {
    throw new Error("greenhouse P2 skill 缺少 userId。");
  }
  return context.userId;
}

function service<T>(context: GreenhouseSkillHandlerContext, key: string): T {
  const value = context.services?.[key];
  if (!value || typeof value !== "object") {
    throw new Error(`greenhouse P2 skill 缺少平台服务：${key}`);
  }
  return value as T;
}

export async function handleGreenhouseP2Skill(
  intent: IntentPayload,
  context: GreenhouseSkillHandlerContext,
): Promise<DomainPackSkillHandlerResult> {
  const target = intent.target as { plot_id?: string; greenhouse_id?: string };
  const params = intent.parameters as {
    query?: string;
    title?: string;
    due_date?: string;
    greenhouse_id?: string;
    status?: "pending" | "done" | "all";
  };
  if (intent.skill === "satellite.query_ndvi") {
    const ndvi = service<SatelliteNdviService>(context, "satelliteNdvi");
    const plot = ndvi.resolvePlot({
      plot_id: target.plot_id,
      entity_id: target.greenhouse_id,
    });
    const entry = await ndvi.fetchForPlot(plot);
    return {
      reply: ndvi.formatReply(plot, entry),
      params: { plot, entry },
    };
  }

  if (intent.skill === "agronomy.query_pest") {
    const query = String(params.query ?? "").trim();
    const pests = service<AgronomyPestsService>(context, "agronomyPests");
    return {
      reply: pests.formatReply(query),
      params: { query, deployment_id: requireDeploymentId(context) },
    };
  }

  if (intent.skill === "tasks.create_task") {
    const deployment_id = requireDeploymentId(context);
    const tasks = service<SceneTasksService>(context, "sceneTasks");
    const task = tasks.create({
      deployment_id,
      title: String(params.title ?? ""),
      created_by: requireUserId(context),
      due_date: params.due_date,
      entity_id: params.greenhouse_id,
    });
    const due = task.due_date ? `，截止 ${task.due_date}` : "";
    const entity = task.entity_id ? `（${task.entity_id}）` : "";
    return {
      reply: `已创建农事任务${entity}：${task.title}${due}。`,
      params: { task_id: task.task_id, title: task.title },
    };
  }

  if (intent.skill === "tasks.query_task") {
    const deployment_id = requireDeploymentId(context);
    const tasks = service<SceneTasksService>(context, "sceneTasks");
    const status = params.status ?? "pending";
    const rows = tasks.list(deployment_id, status);
    if (rows.length === 0) {
      return {
        reply: status === "pending" ? "当前没有待办农事任务。" : "没有符合条件的农事任务。",
        params: { count: 0, status },
      };
    }
    const lines = rows.slice(0, 10).map((task) => {
      const due = task.due_date ? ` 截止${task.due_date}` : "";
      const entity = task.entity_id ? ` ${task.entity_id}` : "";
      return `- [${task.status}] ${task.title}${entity}${due}`;
    });
    return {
      reply: `农事任务（${rows.length} 条）：\n${lines.join("\n")}`,
      params: { count: rows.length, status },
    };
  }

  if (intent.skill === "advice.query_weekly") {
    const deployment_id = requireDeploymentId(context);
    const advice = service<WeeklyAdviceService>(context, "weeklyAdvice");
    const text = await advice.buildText(deployment_id);
    return {
      reply: `【本周运营建议】\n${text}`,
      params: { deployment_id },
    };
  }

  if (intent.skill === "policy.apply_suggestion") {
    const deployment_id = requireDeploymentId(context);
    const policy = service<PolicySuggestionsService>(context, "policySuggestions");
    const pending = policy.list(deployment_id, "pending");
    if (pending.length === 0) {
      return {
        reply: "当前没有待采纳的策略建议。可先问「这周运营有什么建议」生成周报与建议。",
        params: { deployment_id },
      };
    }

    let target = pending[0]!;
    const idx = intent.parameters?.suggestion_index;
    if (typeof idx === "number") {
      const picked = pending[idx - 1];
      if (!picked) {
        return {
          reply: `没有编号为 ${idx} 的待采纳建议（当前共 ${pending.length} 条）。`,
          params: { deployment_id, pending_count: pending.length },
        };
      }
      target = picked;
    } else if (intent.parameters?.suggestion_id) {
      const picked = pending.find((row) => row.id === intent.parameters!.suggestion_id);
      if (!picked) {
        return {
          reply: "未找到该策略建议，可能已采纳或过期。",
          params: { deployment_id, suggestion_id: intent.parameters.suggestion_id },
        };
      }
      target = picked;
    }

    const result = policy.apply(deployment_id, target.id, requireUserId(context));
    if (!result.ok) {
      return { reply: result.error, params: { deployment_id, suggestion_id: target.id } };
    }
    return {
      reply: `已采纳策略建议：${result.suggestion.reason}`,
      params: {
        deployment_id,
        suggestion_id: result.suggestion.id,
        scene_skill_id: result.suggestion.scene_skill_id,
        kind: result.suggestion.kind,
      },
    };
  }

  return { reply: "暂不支持该农业 P2 技能。", params: {} };
}
