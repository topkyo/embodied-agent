import type { IntentPayload, StructuralHistoryTurn } from "@embodied-agent/core";

const DURATION_MIN_RE = /(\d+)\s*(分钟|分|min|minutes?)/i;
const EXHAUST_START_RE =
  /(启动|打开|开启|开起)(?!了).{0,4}排风|开排风|排风(?:一下|启动|打开|开启|开起)(?!了|吗|没)/;
const HEAT_EXHAUST_RE = /(过热|太热|热了).{0,6}(排|排风)|帮我排一下|排一下/;
const FAN_START_RE = /(启动|打开|开启|开起).{0,4}(通风|风机)/;
const STOP_RE =
  /(停止|关闭|关掉|停下?).{0,4}(排风|通风|风机)|(排风|通风|风机).{0,4}(停止|关闭|关掉|停下?|停了)/;
const EXHAUST_QUERY_RE = /排风.{0,6}(开了多久|多久了|运行多久)/;
const COMMAND_STATUS_RE = /(刚才|上次|最近).{0,6}(排风|通风).{0,6}(执行|成功|启动|打开|多久)/;
const STATUS_RE =
  /(多少度|温度|热不热|过热|太热|机房.{0,4}热|状态|查状态)|(排风|通风).{0,6}(开了吗|开了没|现在开了|运行吗|运行没)/;
const DEFAULT_DURATION_SECONDS = 600;

function durationSeconds(text: string): number | undefined {
  const match = DURATION_MIN_RE.exec(text);
  if (!match) return undefined;
  const minutes = Number(match[1]);
  return Number.isFinite(minutes) ? minutes * 60 : undefined;
}

function defaultTarget(): { cabinet_id?: string } {
  return {};
}

export function tryStructuralIntentOverride(
  utterance: string,
  _history?: readonly StructuralHistoryTurn[],
): IntentPayload | null {
  const text = utterance.trim();
  if (!text) return null;

  // 查询类必须先于「开排风」：避免「排风现在开了吗」命中 start
  if (COMMAND_STATUS_RE.test(text) || EXHAUST_QUERY_RE.test(text)) {
    return {
      skill: "command.query_status",
      target: defaultTarget(),
      parameters: { action: "start_exhaust" },
      confidence: 0.9,
    };
  }

  if (STOP_RE.test(text)) {
    return {
      skill: "industrial.stop_exhaust",
      target: defaultTarget(),
      parameters: {},
      confidence: 0.9,
    };
  }

  if (HEAT_EXHAUST_RE.test(text) || EXHAUST_START_RE.test(text)) {
    const duration = durationSeconds(text) ?? DEFAULT_DURATION_SECONDS;
    return {
      skill: "industrial.start_exhaust",
      target: defaultTarget(),
      parameters: { duration_seconds: duration },
      confidence: 0.9,
    };
  }

  if (FAN_START_RE.test(text)) {
    const duration = durationSeconds(text);
    if (!duration) return null;
    return {
      skill: "industrial.start_exhaust",
      target: defaultTarget(),
      parameters: { duration_seconds: duration },
      confidence: 0.9,
    };
  }

  if (STATUS_RE.test(text)) {
    return {
      skill: "industrial.query_status",
      target: defaultTarget(),
      parameters: {},
      confidence: 0.88,
    };
  }

  return null;
}
