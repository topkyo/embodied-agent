import type {
  DomainPackPreDispatchHandler,
  DomainPackPreDispatchPhase,
  DomainPackPreDispatchResult,
  IntentPayload,
} from "@embodied-agent/core";

type PendingClarificationServices = {
  set?: (entry: {
    user_id: string;
    conversation_id: string;
    expected_skill?: string;
    missing_slots: string[];
    partial: Record<string, unknown>;
  }) => void;
};

type OperationLogServices = {
  append?: (entry: {
    user_id: string;
    skill: IntentPayload["skill"];
    intent_source: "llm";
    model: string;
    params: Record<string, unknown>;
    result: "completed" | "sent" | "rejected" | "clarification" | "failed";
    message: string;
  }) => void;
};

type AlertRuleServices = {
  set?: (
    rule: {
      entity_id: string;
      metric: "temperature_c" | "humidity_percent";
      operator: ">" | ">=" | "<" | "<=";
      value: number;
      updated_by: string;
    },
    deploymentId: string,
  ) => void;
  remove?: (
    greenhouseId: string,
    metric: "temperature_c" | "humidity_percent" | undefined,
    deploymentId: string,
  ) => number;
};

type ReportScheduleServices = {
  upsert?: (input: {
    user_id: string;
    entity_ids: string[];
    interval_minutes: number;
    deployment_id?: string;
  }) => void;
  disableForUser?: (userId: string) => void;
};

function service<T>(services: Record<string, unknown> | undefined, key: string): T {
  return (services?.[key] ?? {}) as T;
}

function fanDurationClarificationReply(): string {
  return "请说明风机要运行多久，例如：「1 号棚风机开 10 分钟」。未说明时长不会默认执行。";
}

function handleFanDurationClarification(
  intent: IntentPayload,
  context: Parameters<DomainPackPreDispatchHandler["handle"]>[2],
): DomainPackPreDispatchResult {
  if (intent.skill !== "fan.start" || intent.parameters?.duration_seconds) {
    return { type: "continue" };
  }
  if (context.conversationId) {
    service<PendingClarificationServices>(context.services, "pendingClarification").set?.({
      user_id: context.userId,
      conversation_id: context.conversationId,
      expected_skill: "fan.start",
      missing_slots: ["duration_seconds"],
      partial: {
        greenhouse_id: intent.target.greenhouse_id,
        fan_id: intent.target.fan_id,
      },
    });
  }
  const reply = fanDurationClarificationReply();
  service<OperationLogServices>(context.services, "operationLogs").append?.({
    user_id: context.userId,
    skill: intent.skill,
    intent_source: "llm",
    model: context.model,
    params: {},
    result: "clarification",
    message: reply,
  });
  return { type: "reply", reply, status: 200 };
}

function handleAlertAndReportMutation(
  intent: IntentPayload,
  context: Parameters<DomainPackPreDispatchHandler["handle"]>[2],
): DomainPackPreDispatchResult {
  const target = intent.target as { greenhouse_id?: string };
  const params = intent.parameters as {
    metric?: string;
    operator?: string;
    value?: number;
    greenhouse_ids?: string[];
    interval_minutes?: number;
  };
  const alerts = service<AlertRuleServices>(context.services, "alertRules");
  const reports = service<ReportScheduleServices>(context.services, "reportSchedules");

  if (intent.skill === "alert.set_threshold") {
    alerts.set?.(
      {
        entity_id: target.greenhouse_id!,
        metric: params.metric as "temperature_c" | "humidity_percent",
        operator: params.operator as ">" | "<" | ">=" | "<=",
        value: params.value as number,
        updated_by: context.userId,
      },
      context.deploymentId,
    );
    return { type: "continue" };
  }

  if (intent.skill === "alert.clear_threshold") {
    const removed =
      alerts.remove?.(
        target.greenhouse_id!,
        params.metric as "temperature_c" | "humidity_percent" | undefined,
        context.deploymentId,
      ) ?? 0;
    if (removed === 0) {
      const gh = target.greenhouse_id!;
      const metric = params.metric;
      const reply = metric
        ? `${gh} 没有可清除的 ${metric} 报警阈值。`
        : `${gh} 没有可清除的报警阈值。`;
      service<OperationLogServices>(context.services, "operationLogs").append?.({
        user_id: context.userId,
        skill: intent.skill,
        intent_source: "llm",
        model: context.model,
        params: { entity_id: gh, metric },
        result: "completed",
        message: reply,
      });
      return { type: "reply", reply, status: 200 };
    }
    return { type: "continue" };
  }

  if (intent.skill === "report.set_schedule") {
    reports.upsert?.({
      user_id: context.userId,
      entity_ids: params.greenhouse_ids!,
      interval_minutes: params.interval_minutes!,
      deployment_id: context.deploymentId,
    });
    return { type: "continue" };
  }

  if (intent.skill === "report.cancel_schedule") {
    reports.disableForUser?.(context.userId);
    return { type: "continue" };
  }

  return { type: "continue" };
}

export function handleGreenhousePreDispatch(
  phase: DomainPackPreDispatchPhase,
  intent: IntentPayload,
  context: Parameters<DomainPackPreDispatchHandler["handle"]>[2],
): DomainPackPreDispatchResult {
  if (phase === "pre_safety") {
    return handleFanDurationClarification(intent, context);
  }
  if (phase === "post_confirmation") {
    return handleAlertAndReportMutation(intent, context);
  }
  return { type: "continue" };
}
