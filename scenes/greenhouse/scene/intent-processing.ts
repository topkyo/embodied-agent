import type { DomainPackIntentProcessing, IntentPayload } from "@embodied-agent/core";
import { GREENHOUSE_PHYSICAL_SKILLS } from "../skills.js";
import { refineIrrigationFromUtterance } from "../structural/structural-intent.js";

const UTTERANCE_REPLACEMENTS: ReadonlyArray<[RegExp, string]> = [
  [/(\d+)\s*号?\s*[盆盘庞朋](?![a-zA-Z])/g, "$1号棚"],
  [/([一二两三四五六七八九十]+)\s*号?\s*[盆盘庞朋]/g, "$1号棚"],
  [/侧[连联帘]/g, "侧帘"],
  [/通[凤风封]/g, "通风"],
  [/夜[间间]/g, "夜间"],
];

const ALERT_CAP_RE = /不超过|别超过|不大于|低于|至多|最多|不能超|勿超|别超/;
const ALERT_FLOOR_RE = /不低于|不小于|至少|以上/;

const IRRIGATION_HINT = /灌溉|浇水|浇地/;
const VENT_HINT = /通风|侧帘|开帘|卷帘|拉帘|放帘/;
const FAN_HINT = /风机/;
const ROBOT_DOMAIN_HINT = /机器狗|机器人|M20|吊舱|云台|喊话器|工作灯|红蓝|警报|充电桩|dock/i;
const NEGATED_IRRIGATION_CONTROL_RE = /(?:不要|别|先别|禁止|不用|无需).{0,12}(?:灌溉|浇水|浇地)/;
const COMMAND_STATUS_RE = /(?:(?:刚才|上次|上一条).{0,12})?(?:执行了吗|成功了吗|下发了吗|完成了吗)/;
const UNKNOWN_GREENHOUSE_RE = /(?:[3-9]\s*号(?:棚|大棚)|[三四五六七八九]\s*号(?:棚|大棚))/;

const PHYSICAL_CONTROL_SKILLS = new Set<string>(GREENHOUSE_PHYSICAL_SKILLS);

function usesEmptyTarget(skill: unknown): boolean {
  return (
    skill === "greenhouse.query_all_status" ||
    skill === "log.query_today" ||
    skill === "alert.query_today" ||
    skill === "report.set_schedule" ||
    skill === "report.cancel_schedule" ||
    skill === "report.query_schedule" ||
    skill === "weather.query_forecast" ||
    skill === "weather.query_alert" ||
    skill === "agronomy.query_pest" ||
    skill === "tasks.query_task" ||
    skill === "tasks.create_task" ||
    skill === "advice.query_weekly" ||
    skill === "policy.apply_suggestion"
  );
}

function normalizeAlertParameters(p: Record<string, unknown>): Record<string, unknown> {
  const out = { ...p };

  if (out.metric === undefined) {
    const sensor = String(out.sensor_type ?? out.sensor ?? "").toLowerCase();
    if (sensor.includes("humid") || sensor.includes("湿")) {
      out.metric = "humidity_percent";
    } else {
      out.metric = "temperature_c";
    }
  }
  if (out.metric === "temperature" || out.metric === "temp") {
    out.metric = "temperature_c";
  }

  if (out.value === undefined) {
    const v =
      out.threshold ?? out.threshold_temp_c ?? out.threshold_c ?? out.temp ?? out.temperature;
    if (typeof v === "number") out.value = v;
  }

  if (out.operator === undefined && out.direction !== undefined) {
    const d = String(out.direction).toLowerCase();
    if (d === "above" || d === "over" || d === "high" || d === "gt") {
      out.operator = ">";
    } else if (d === "below" || d === "low" || d === "lt") {
      out.operator = "<";
    }
  }
  if (typeof out.operator === "string") {
    const op = out.operator.toLowerCase();
    if (op === "above" || op === "over" || op === "greater") out.operator = ">";
    if (op === "below" || op === "under" || op === "less") out.operator = "<";
    if (op === "gte" || op === "ge") out.operator = ">=";
    if (op === "lte" || op === "le") out.operator = "<=";
  }

  if (out.operator === undefined && typeof out.value === "number") {
    out.operator = ">";
  }

  delete out.sensor_type;
  delete out.sensor;
  delete out.threshold;
  delete out.threshold_temp_c;
  delete out.threshold_c;
  delete out.temp;
  delete out.temperature;
  delete out.direction;

  return out;
}

function stripDeploymentIdFromTarget(target: Record<string, unknown>): Record<string, unknown> {
  const t = { ...target };
  delete t.deployment_id;
  return t;
}

function normalizeReportScheduleParameters(
  p: Record<string, unknown>,
  target: unknown,
): Record<string, unknown> {
  const out = { ...p };
  const t = target && typeof target === "object" ? (target as Record<string, unknown>) : {};

  if (!Array.isArray(out.greenhouse_ids) || out.greenhouse_ids.length === 0) {
    const ids: string[] = [];
    if (Array.isArray(out.greenhouses)) {
      for (const g of out.greenhouses) {
        if (typeof g === "string") ids.push(g);
        else if (g && typeof g === "object" && (g as { greenhouse_id?: string }).greenhouse_id) {
          ids.push((g as { greenhouse_id: string }).greenhouse_id);
        }
      }
    }
    if (typeof out.greenhouse_id === "string") ids.push(out.greenhouse_id);
    if (typeof t.greenhouse_id === "string") ids.push(t.greenhouse_id);
    if (ids.length > 0) out.greenhouse_ids = [...new Set(ids)];
  }

  if (out.interval_minutes === undefined) {
    const n = out.interval ?? out.every_n_minutes ?? out.period_minutes ?? out.frequency_minutes;
    if (typeof n === "number") out.interval_minutes = Math.round(n);
  }
  if (typeof out.interval_minutes === "string") {
    out.interval_minutes = Number.parseInt(out.interval_minutes, 10);
  }
  if (
    typeof out.interval_minutes !== "number" ||
    !Number.isFinite(out.interval_minutes) ||
    out.interval_minutes < 1
  ) {
    out.interval_minutes = 15;
  }
  out.interval_minutes = Math.min(Math.max(Math.round(out.interval_minutes as number), 1), 24 * 60);

  delete out.greenhouse_id;
  delete out.greenhouses;
  delete out.interval;
  delete out.every_n_minutes;
  delete out.period_minutes;
  delete out.frequency_minutes;

  return out;
}

function normalizeGreenhouseLlmShape(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const raw = data as Record<string, unknown>;
  const out: Record<string, unknown> = { ...raw };

  if (typeof out.target === "string") {
    const id = out.target;
    if (out.skill === "greenhouse.query_all_status") {
      out.target = {};
    } else if (out.skill === "log.query_today" || out.skill === "alert.query_today") {
      out.target = { greenhouse_id: id };
    } else if (
      typeof out.skill === "string" &&
      (out.skill === "fan.start" || out.skill === "fan.stop")
    ) {
      out.target = id.startsWith("fan-") ? { fan_id: id } : { fan_id: `fan-${id}-01` };
    } else {
      out.target = { greenhouse_id: id };
    }
  } else if (out.target === null || out.target === undefined) {
    if (usesEmptyTarget(out.skill)) {
      out.target = {};
    }
  } else if (typeof out.target === "object" && out.target !== null) {
    const t = stripDeploymentIdFromTarget(out.target as Record<string, unknown>);
    if ((out.skill === "fan.start" || out.skill === "fan.stop") && t.greenhouse_id && !t.fan_id) {
      t.fan_id = `fan-${t.greenhouse_id}-01`;
    }
    out.target = t;
  }

  if (
    (out.skill === "fan.start" || out.skill === "fan.stop") &&
    (out.parameters === undefined || out.parameters === null)
  ) {
    out.parameters = {};
  }

  if (out.parameters && typeof out.parameters === "object") {
    const p = { ...(out.parameters as Record<string, unknown>) };
    if (typeof p.duration_minutes === "number") {
      p.duration_seconds = Math.round(p.duration_minutes * 60);
      delete p.duration_minutes;
    }
    if (typeof p.duration === "number" && p.duration_seconds === undefined) {
      p.duration_seconds = Math.round(p.duration * 60);
      delete p.duration;
    }
    if (out.skill === "alert.set_threshold") {
      Object.assign(p, normalizeAlertParameters(p));
    }
    if (out.skill === "report.set_schedule") {
      Object.assign(p, normalizeReportScheduleParameters(p, out.target));
    }
    out.parameters = p;
  }

  if (usesEmptyTarget(out.skill)) {
    const t =
      out.target && typeof out.target === "object"
        ? stripDeploymentIdFromTarget(out.target as Record<string, unknown>)
        : {};
    const onlyGreenhouseId = Object.keys(t).length === 1 && typeof t.greenhouse_id === "string";
    if (onlyGreenhouseId && out.skill === "log.query_today") {
      out.target = { greenhouse_id: t.greenhouse_id };
    } else if (onlyGreenhouseId && out.skill === "alert.query_today") {
      out.target = { greenhouse_id: t.greenhouse_id };
    } else if (Object.keys(t).length === 0 || usesEmptyTarget(out.skill)) {
      out.target = {};
    }
  }

  return out;
}

function refineGreenhouseIntentFromUtterance(
  utterance: string,
  intent: IntentPayload,
): IntentPayload {
  intent = refineIrrigationFromUtterance(utterance, intent);
  const u = utterance.trim();
  if (ROBOT_DOMAIN_HINT.test(u)) {
    return {
      skill: "clarification_needed",
      target: {},
      clarification: "当前启用的是 agriculture Domain Pack，机器人相关指令不在本场景内。",
    } as IntentPayload;
  }
  if (UNKNOWN_GREENHOUSE_RE.test(u)) {
    return {
      skill: "clarification_needed",
      target: {},
      clarification: "当前只有 1 号棚和 2 号棚，请确认要操作或查询哪个棚。",
    } as IntentPayload;
  }
  if (NEGATED_IRRIGATION_CONTROL_RE.test(u)) {
    return {
      skill: "clarification_needed",
      target: {},
      clarification: "这是一个否定灌溉请求，请明确要查询状态、取消计划，还是停止正在运行的灌溉。",
    } as IntentPayload;
  }
  if (COMMAND_STATUS_RE.test(u) && intent.skill === "clarification_needed") {
    return {
      skill: "command.query_status",
      target: {},
      parameters: { recent: true },
      confidence: 0.9,
    } as IntentPayload;
  }
  if (intent.skill === "tasks.create_task") {
    const target = intent.target && typeof intent.target === "object" ? { ...intent.target } : {};
    const parameters =
      intent.parameters && typeof intent.parameters === "object" ? { ...intent.parameters } : {};
    const gh =
      greenhouseIdFromUtterance(u) ??
      (typeof target.greenhouse_id === "string" ? target.greenhouse_id : undefined) ??
      (typeof parameters.greenhouse_id === "string" ? parameters.greenhouse_id : undefined);
    if (gh) parameters.greenhouse_id = gh;
    return { ...intent, target: {}, parameters } as IntentPayload;
  }
  if (intent.skill === "policy.apply_suggestion") {
    const parameters =
      intent.parameters && typeof intent.parameters === "object" ? { ...intent.parameters } : {};
    if (parameters.suggestion_index === undefined && parameters.suggestion_id === undefined) {
      parameters.suggestion_index = 1;
    }
    return { ...intent, target: {}, parameters } as IntentPayload;
  }
  if (intent.skill !== "alert.set_threshold") return intent;
  const params = intent.parameters;
  if (!params || typeof params.value !== "number") return intent;
  if (ALERT_CAP_RE.test(u)) {
    return {
      ...intent,
      parameters: { ...params, operator: "<=" },
    };
  }
  if (ALERT_FLOOR_RE.test(u)) {
    return {
      ...intent,
      parameters: { ...params, operator: ">=" },
    };
  }
  if (/超过|高于|大于/.test(u) && !/不/.test(u)) {
    return {
      ...intent,
      parameters: { ...params, operator: ">" },
    };
  }
  return intent;
}

function normalizeGreenhouseUtterance(text: string): string {
  let out = text.trim();
  for (const [pattern, replacement] of UTTERANCE_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function greenhouseIdFromUtterance(utterance: string): "gh-001" | "gh-002" | null {
  if (/(?:2号(?:棚|大棚)|二号(?:棚|大棚)|gh-002)/i.test(utterance)) return "gh-002";
  if (/(?:1号(?:棚|大棚)|一号(?:棚|大棚)|gh-001)/i.test(utterance)) return "gh-001";
  return null;
}

function detectGreenhouseSkillUtteranceConflict(utterance: string, skill: string): boolean {
  const t = utterance.trim();
  if (!t) return false;

  const wantsIrrigation = IRRIGATION_HINT.test(t);
  const wantsVent = VENT_HINT.test(t);
  const wantsFan = FAN_HINT.test(t);

  const isIrrigation = skill.startsWith("irrigation.");
  const isVent =
    skill === "greenhouse.open_vent" ||
    skill === "greenhouse.close_vent" ||
    skill === "greenhouse.stop_vent";
  const isFan = skill === "fan.start" || skill === "fan.stop";

  if (wantsIrrigation && (isVent || isFan)) return true;
  if (wantsVent && !wantsIrrigation && isIrrigation) return true;
  if (wantsFan && !wantsIrrigation && isIrrigation) return true;
  return false;
}

function greenhouseDisambiguationRules(deploymentTarget: string): string {
  return `规则：
1. 将用户消息映射为 skill、target（必须是对象）、parameters；禁止输出 GPIO、MQTT、继电器等字段。
2. 当前农场 target 查全部用 ${deploymentTarget}；查单棚用 {"greenhouse_id":"gh-001"}；风机用 {"fan_id":"fan-gh-001-01"}。**查环境**→ greenhouse.query_*；**查灌溉状态**→ irrigation.query_status；**查指令/模式是否生效**→ command.query_status（不是 greenhouse.query_status）。
3. 通风时长用 parameters.duration_seconds；「把 N 号棚最长通风改成 X 分钟/打开 N 分钟」→ greenhouse.open_vent；整夜环控用 greenhouse.set_mode，勿用超长 open_vent。
4. 「夜间别超 N 度」「N号棚自动通风」→ set_mode(night_vent)；「关闭夜间模式」→ set_mode(off)。
5. 报警用 alert.set_threshold（metric/operator/value）。超过/高于 N 度 → operator ">" value N；不超过/别超过/低于 N 度 → operator "<=" value N。「N号棚湿度/温度报警阈值」无设置动作 → alert.query_threshold；清除/今日报警见 clear_threshold / query_today。
6. 「今天谁动了」→ log.query_today。
7. 灌溉：浇水/灌溉→ irrigation.start（≠ open_vent）；「A区灌溉N分钟」「B区浇水」仅有分区无棚号→ 直接 zone-a/zone-b，**禁止**追问「哪个大棚」；仅给棚号未给 A/B 区→ zone-a；2号棚浇水勿因「A区」字面冲突而 clarification；停止→ irrigation.stop；状态/在浇水吗→ irrigation.query_status。
8. 定时汇报：设置/每隔 N 分钟汇报→ report.set_schedule；取消/关闭→ report.cancel_schedule；「定时汇报是什么/多久报一次/现在多久一次」→ report.query_schedule（target 用农场 ID，勿 clarification_needed）。
9. command.query_status：「刚才…执行了吗」→ action；「成功了吗」→ recent=true；夜间模式→ action=set_mode。
10. fan.start 必须带 duration_seconds，否则 clarification_needed。
11. 天气预报→ weather.query_forecast；灾害预警→ weather.query_alert。
12. 非 agriculture 设备词（机器狗/M20/吊舱/云台/充电桩/喊话器/工作灯/警报）在当前 active_domain 下必须 clarification_needed，不要改写成农事任务。
13. 否定灌溉句（不要/别/禁止浇水）必须 clarification_needed，不要解析成 start/stop。
14. P2：satellite.query_ndvi、agronomy.query_pest、tasks.query_task、tasks.create_task、advice.query_weekly、policy.apply_suggestion。tasks.create_task 的棚号放 parameters.greenhouse_id。
15. 有对话历史时必须结合历史续接槽位；没有报警上下文的「也是30度」必须 clarification_needed。`;
}

function greenhouseIntentExamples(deploymentTarget: string): string {
  return `示例（只输出 JSON，不要 markdown）：
{"skill":"greenhouse.query_status","target":{"greenhouse_id":"gh-001"},"confidence":0.95}
{"skill":"greenhouse.open_vent","target":{"greenhouse_id":"gh-001"},"parameters":{"duration_seconds":600},"confidence":0.9}
{"skill":"fan.start","target":{"fan_id":"fan-gh-001-01"},"parameters":{"duration_seconds":480},"confidence":0.9}
{"skill":"greenhouse.set_mode","target":{"greenhouse_id":"gh-001"},"parameters":{"mode":"night_vent","max_temp_c":30,"temp_low_c":28},"confidence":0.9}
{"skill":"alert.set_threshold","target":{"greenhouse_id":"gh-002"},"parameters":{"metric":"temperature_c","operator":">","value":30},"confidence":0.9}
{"skill":"alert.set_threshold","target":{"greenhouse_id":"gh-001"},"parameters":{"metric":"temperature_c","operator":"<=","value":28},"confidence":0.9}
{"skill":"command.query_status","target":{"greenhouse_id":"gh-001"},"parameters":{"action":"set_mode"},"confidence":0.9}
{"skill":"irrigation.start","target":{"zone_id":"zone-a"},"parameters":{"duration_seconds":300},"confidence":0.9}
{"skill":"report.set_schedule","target":${deploymentTarget},"parameters":{"greenhouse_ids":["gh-001","gh-002"],"interval_minutes":15},"confidence":0.9}
{"skill":"report.query_schedule","target":${deploymentTarget},"confidence":0.9}
{"skill":"weather.query_forecast","target":${deploymentTarget},"confidence":0.9}
{"skill":"agronomy.query_pest","target":${deploymentTarget},"parameters":{"query":"高湿霉病"},"confidence":0.9}
{"skill":"policy.apply_suggestion","target":${deploymentTarget},"parameters":{"suggestion_index":1},"confidence":0.9}`;
}

export const GREENHOUSE_INTENT_PROCESSING: DomainPackIntentProcessing = {
  prompt: {
    parserPreamble:
      "你是具身 Agent「守棚工长」的意图解析器。只输出一行 JSON，禁止 markdown、解释或思考过程，不控制硬件。",
    clarificationRule:
      '含糊目标（如「把棚打开」未指明哪座）时，skill 设为 "clarification_needed" 并在 clarification 字段用中文追问。',
    disambiguationRules: greenhouseDisambiguationRules,
    examples: greenhouseIntentExamples,
  },
  normalizeUtterance: normalizeGreenhouseUtterance,
  normalizeLlmShape: normalizeGreenhouseLlmShape,
  refineIntentFromUtterance: refineGreenhouseIntentFromUtterance,
  detectSkillUtteranceConflict: detectGreenhouseSkillUtteranceConflict,
  isLowConfidenceControlSkill: (skill) => PHYSICAL_CONTROL_SKILLS.has(skill),
};
