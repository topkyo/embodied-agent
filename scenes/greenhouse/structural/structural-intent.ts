import type { IntentPayload, StructuralHistoryTurn } from "@embodied-agent/core";

const IRRIGATION_RE = /(?:灌溉|浇水)/;
const IRRIGATION_NEGATIVE_RE =
  /(?:不要|别|禁止|取消|停止|停一下|状态|计划|安排|开了吗|有没有|是否|吗\s*$)/;
const ZONE_A_RE = /[Aa]区/;
const ZONE_B_RE = /[Bb]区/;
const DURATION_MIN_RE = /(\d+)\s*分钟/;
const DURATION_SEC_RE = /(\d+)\s*秒/;
const ALERT_FOLLOW_RE = /^也是\s*(\d+(?:\.\d+)?)\s*度/;
const GH_001_RE = /(?:1号(?:棚|大棚|门)|一号(?:棚|大棚|门)|gh-001)/i;
const GH_002_RE = /(?:2号(?:棚|大棚|门)|二号(?:棚|大棚|门)|gh-002)/i;
const GH_NUM_RE = /(?:[12一二]号(?:棚|大棚|门)|gh-00[12])/i;
const ALERT_CONTEXT_RE = /(?:报警|超过|不超过|阈值|别超)/;
const ALERT_QUERY_RE = /(?:报警)?阈值/;
const ALERT_SET_RE = /超过|不超过|设为|设置|改成|清除|如果|就报警|别超/;
const AUTO_VENT_RE = /自动通风/;
const AUTO_VENT_QUERY_RE = /开了吗|有没有|是否|怎么样|吗\s*$/;
const AUTO_VENT_OFF_RE = /关闭|取消|关掉|停用|off/i;
const NIGHT_MODE_STATUS_RE =
  /(?:夜间(?:模式|通风|自动通风).{0,8}(?:开了吗|打开了吗|有没有|是否|状态|怎么样)|(?:开了吗|打开了吗|有没有|是否).{0,8}夜间(?:模式|通风|自动通风))/;
const NIGHT_MODE_ENABLE_RE =
  /(?:可以)?(?:开启|打开|启用).{0,8}夜间(?:模式|通风|自动通风)|夜间(?:模式|通风|自动通风).{0,8}(?:开启|打开|启用)/;
const COMMAND_STATUS_RE = /(?:(?:刚才|上次|上一条).{0,12})?(?:执行了吗|成功了吗|下发了吗|完成了吗)/;
const DOOR_VENT_RE =
  /(?:门|侧帘|通风).{0,8}(?:打开|开启|开)|(?:打开|开启|开).{0,8}(?:门|侧帘|通风)/;
const CONFIRM_ENABLE_RE = /^(?:可以)?开启吗$|^可以(?:开启|打开|执行)吗$/;
const FAN_RE = /风机/;
const FAN_STOP_RE = /(?:停|停止|关闭|关掉|关).{0,8}风机|风机.{0,8}(?:停|停止|关闭|关掉|关)/;
const FAN_START_RE = /(?:打开|开启|开).{0,8}风机|风机.{0,8}(?:打开|开启|开)/;

function parseDurationSeconds(utterance: string): number | null {
  const min = utterance.match(DURATION_MIN_RE);
  if (min) return Number.parseInt(min[1]!, 10) * 60;
  const sec = utterance.match(DURATION_SEC_RE);
  if (sec) return Number.parseInt(sec[1]!, 10);
  return null;
}

function parseZoneId(utterance: string): "zone-a" | "zone-b" | null {
  if (ZONE_A_RE.test(utterance)) return "zone-a";
  if (ZONE_B_RE.test(utterance)) return "zone-b";
  return null;
}

function tryParseIrrigationUtterance(utterance: string): IntentPayload | null {
  if (!IRRIGATION_RE.test(utterance)) return null;
  if (IRRIGATION_NEGATIVE_RE.test(utterance)) return null;
  const duration_seconds = parseDurationSeconds(utterance);
  if (!duration_seconds) return null;

  const zone_id = parseZoneId(utterance);
  if (zone_id) {
    return {
      skill: "irrigation.start",
      target: { zone_id },
      parameters: { duration_seconds },
    };
  }

  if (GH_NUM_RE.test(utterance)) {
    const greenhouse_id = GH_002_RE.test(utterance) ? "gh-002" : "gh-001";
    return {
      skill: "irrigation.start",
      target: { zone_id: "zone-a", greenhouse_id },
      parameters: { duration_seconds },
    };
  }

  return null;
}

function alertOperatorFromUtterance(utterance: string): ">" | "<=" | ">=" | "<" {
  if (/不超过|别超过|低于|至多|最多/.test(utterance)) return "<=";
  if (/不低于|不小于|至少/.test(utterance)) return ">=";
  return ">";
}

function priorAlertGreenhouse(history: readonly StructuralHistoryTurn[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (!turn || turn.role !== "user") continue;
    if (!ALERT_CONTEXT_RE.test(turn.content)) continue;
    if (GH_001_RE.test(turn.content)) return "gh-001";
    if (GH_002_RE.test(turn.content)) return "gh-002";
  }
  return null;
}

function tryParseAlertFollowUp(
  utterance: string,
  history: readonly StructuralHistoryTurn[],
): IntentPayload | null {
  const follow = utterance.trim().match(ALERT_FOLLOW_RE);
  if (!follow) return null;
  const priorGh = priorAlertGreenhouse(history);
  if (!priorGh) return null;

  const value = Number.parseFloat(follow[1]!);
  if (!Number.isFinite(value)) return null;

  const priorTurn = [...history]
    .reverse()
    .find((t) => t.role === "user" && ALERT_CONTEXT_RE.test(t.content));
  const operator = priorTurn ? alertOperatorFromUtterance(priorTurn.content) : ">";

  const greenhouse_id = priorGh === "gh-001" ? "gh-002" : "gh-001";
  return {
    skill: "alert.set_threshold",
    target: { greenhouse_id },
    parameters: {
      metric: "temperature_c",
      operator,
      value,
    },
  };
}

function tryParseBareAlertFollowUpWithoutContext(
  utterance: string,
  history: readonly StructuralHistoryTurn[],
): IntentPayload | null {
  if (!utterance.trim().match(ALERT_FOLLOW_RE)) return null;
  if (priorAlertGreenhouse(history)) return null;
  return {
    skill: "clarification_needed",
    target: {},
    clarification: "缺少上一条报警设置上下文，请说明哪个棚、什么指标和阈值。",
  } as IntentPayload;
}

function greenhouseFromUtterance(utterance: string): "gh-001" | "gh-002" | null {
  if (GH_002_RE.test(utterance)) return "gh-002";
  if (GH_001_RE.test(utterance)) return "gh-001";
  return null;
}

function tryParseAlertQueryUtterance(utterance: string): IntentPayload | null {
  if (!ALERT_QUERY_RE.test(utterance)) return null;
  if (ALERT_SET_RE.test(utterance)) return null;
  const greenhouse_id = greenhouseFromUtterance(utterance);
  if (!greenhouse_id) return null;
  return {
    skill: "alert.query_threshold",
    target: { greenhouse_id },
  };
}

function tryParseAutoVentSetMode(utterance: string): IntentPayload | null {
  if (!AUTO_VENT_RE.test(utterance)) return null;
  if (AUTO_VENT_QUERY_RE.test(utterance)) return null;
  if (AUTO_VENT_OFF_RE.test(utterance)) return null;
  const greenhouse_id = greenhouseFromUtterance(utterance);
  if (!greenhouse_id) return null;
  return {
    skill: "greenhouse.set_mode",
    target: { greenhouse_id },
    parameters: { mode: "night_vent" },
  };
}

function tryParseNightModeEnable(utterance: string): IntentPayload | null {
  if (!NIGHT_MODE_ENABLE_RE.test(utterance)) return null;
  const greenhouse_id = greenhouseFromUtterance(utterance);
  if (!greenhouse_id) return null;
  return {
    skill: "greenhouse.set_mode",
    target: { greenhouse_id },
    parameters: { mode: "night_vent" },
  };
}

function tryParseAmbiguousAutoVentOff(utterance: string): IntentPayload | null {
  if (!/(?:夜间通风|自动通风)/.test(utterance)) return null;
  if (!AUTO_VENT_OFF_RE.test(utterance)) return null;
  if (greenhouseFromUtterance(utterance)) return null;
  return {
    skill: "clarification_needed",
    target: {},
    clarification: "请指定要关闭哪个棚的夜间通风。",
  } as IntentPayload;
}

function tryParseDoorVentUtterance(utterance: string): IntentPayload | null {
  if (!DOOR_VENT_RE.test(utterance)) return null;
  const greenhouse_id = greenhouseFromUtterance(utterance);
  const duration_seconds = parseDurationSeconds(utterance);
  if (!greenhouse_id || !duration_seconds) return null;
  return {
    skill: "greenhouse.open_vent",
    target: { greenhouse_id },
    parameters: { duration_seconds },
  };
}

function fanIdForGreenhouse(greenhouse_id: "gh-001" | "gh-002"): string {
  return `fan-${greenhouse_id}-01`;
}

function tryParseFanUtterance(utterance: string): IntentPayload | null {
  if (!FAN_RE.test(utterance)) return null;
  const greenhouse_id = greenhouseFromUtterance(utterance);
  if (!greenhouse_id) return null;
  const fan_id = fanIdForGreenhouse(greenhouse_id);
  if (FAN_STOP_RE.test(utterance)) {
    return {
      skill: "fan.stop",
      target: { fan_id },
    };
  }
  const duration_seconds = parseDurationSeconds(utterance);
  if (duration_seconds && FAN_START_RE.test(utterance)) {
    return {
      skill: "fan.start",
      target: { fan_id },
      parameters: { duration_seconds },
    };
  }
  return null;
}

function priorNightVentGreenhouse(
  history: readonly StructuralHistoryTurn[],
): "gh-001" | "gh-002" | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (!turn || turn.role !== "user") continue;
    if (!/(夜间|自动通风|别超过|不超过)/.test(turn.content)) continue;
    const gh = greenhouseFromUtterance(turn.content);
    if (gh) return gh;
  }
  return null;
}

function tryParseConfirmNightVent(
  utterance: string,
  history: readonly StructuralHistoryTurn[],
): IntentPayload | null {
  if (!CONFIRM_ENABLE_RE.test(utterance.trim())) return null;
  const greenhouse_id = priorNightVentGreenhouse(history);
  if (!greenhouse_id) return null;
  return {
    skill: "greenhouse.set_mode",
    target: { greenhouse_id },
    parameters: { mode: "night_vent" },
  };
}

const QUERY_STATUS_RE = /多少度|温度|湿度|状态/;
const UNKNOWN_GH_NUM_RE = /[3-9]号(?:棚|大棚)|[三四五六七八九]号(?:棚|大棚)/;

function tryParseUnknownGreenhouseQuery(utterance: string): IntentPayload | null {
  if (!QUERY_STATUS_RE.test(utterance)) return null;
  if (GH_NUM_RE.test(utterance)) return null;
  if (!UNKNOWN_GH_NUM_RE.test(utterance)) return null;
  return {
    skill: "clarification_needed",
    target: {},
    clarification: "当前只有一号棚和二号棚，请确认要查询哪个。",
  } as IntentPayload;
}

function tryParseCommandStatusUtterance(utterance: string): IntentPayload | null {
  if (!COMMAND_STATUS_RE.test(utterance)) return null;
  if (/刚才/.test(utterance) && /通风|开帘|侧帘/.test(utterance)) {
    return {
      skill: "command.query_status",
      target: {},
      parameters: { action: "open_vent" },
    };
  }
  return {
    skill: "command.query_status",
    target: {},
    parameters: { recent: true },
  };
}

function tryParseNightModeStatusUtterance(utterance: string): IntentPayload | null {
  if (!NIGHT_MODE_STATUS_RE.test(utterance)) return null;
  const hasGh001 = GH_001_RE.test(utterance);
  const hasGh002 = GH_002_RE.test(utterance);
  const greenhouse_id = hasGh001 === hasGh002 ? null : hasGh002 ? "gh-002" : "gh-001";
  return {
    skill: "command.query_status",
    target: greenhouse_id ? { greenhouse_id } : {},
    parameters: { action: "set_mode" },
  };
}

/** Deterministic overrides when the LLM returns clarification on known patterns. */
export function tryStructuralIntentOverride(
  utterance: string,
  history: readonly StructuralHistoryTurn[] = [],
): IntentPayload | null {
  return (
    tryParseUnknownGreenhouseQuery(utterance) ??
    tryParseNightModeStatusUtterance(utterance) ??
    tryParseCommandStatusUtterance(utterance) ??
    tryParseFanUtterance(utterance) ??
    tryParseDoorVentUtterance(utterance) ??
    tryParseConfirmNightVent(utterance, history) ??
    tryParseIrrigationUtterance(utterance) ??
    tryParseAlertFollowUp(utterance, history) ??
    tryParseBareAlertFollowUpWithoutContext(utterance, history) ??
    tryParseAlertQueryUtterance(utterance) ??
    tryParseAmbiguousAutoVentOff(utterance) ??
    tryParseNightModeEnable(utterance) ??
    tryParseAutoVentSetMode(utterance)
  );
}

/** Fill missing irrigation target slots from utterance (1号大棚→gh-001，默认 zone-a）。 */
export function refineIrrigationFromUtterance(
  utterance: string,
  intent: IntentPayload,
): IntentPayload {
  if (intent.skill !== "irrigation.start" && intent.skill !== "irrigation.stop") {
    return intent;
  }
  const target = { ...intent.target } as Record<string, unknown>;
  if (!target.greenhouse_id) {
    if (GH_002_RE.test(utterance)) target.greenhouse_id = "gh-002";
    else if (GH_001_RE.test(utterance)) target.greenhouse_id = "gh-001";
    else if (intent.skill === "irrigation.stop" && parseZoneId(utterance)) {
      target.greenhouse_id = "gh-001";
    }
  }
  if (!target.zone_id) {
    if (ZONE_A_RE.test(utterance)) target.zone_id = "zone-a";
    else if (ZONE_B_RE.test(utterance)) target.zone_id = "zone-b";
    else if (target.greenhouse_id) {
      target.zone_id = "zone-a";
    }
  }
  return { ...intent, target } as IntentPayload;
}
