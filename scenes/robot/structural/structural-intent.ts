import type { IntentPayload, StructuralHistoryTurn } from "@embodied-agent/core";

const STOP_ALARM_RE =
  /(?:停止|关闭|停掉|停下|关掉).{0,8}(?:警报|报警声|报警器|警示声)|(?:警报|报警声|报警器|警示声).{0,8}(?:停止|关闭|停掉|停下|关掉)/;
const BODY_CAPTURE_RE = /(?:拍|抓取|取).{0,8}(?:图|图片|照片|现场图|现场照片)|(?:现场图|现场照片)/;
const GIMBAL_CAPTURE_RE =
  /(?:吊舱|云台).{0,8}(?:拍|抓取|取).{0,8}(?:图|图片|照片|可见光|热成像|红外)/;
const FORWARD_MOVE_RE = /(?:往前|向前|前进|前方).{0,6}(?:挪|走|移动|开)?.{0,4}(?:一|1)\s*秒/;
const INSPECTION_RE =
  /(?:(?:巡检|取证|复查|看看|看一下).{0,12}(?:充电桩|dock|门口|通道))|(?:(?:充电桩|dock|门口|通道).{0,12}(?:巡检|取证|复查|看看|看一下))/i;
const WORK_LIGHT_RE =
  /(?:打开|开启|开).{0,4}(?:工作灯|照明灯)|(?:工作灯|照明灯).{0,4}(?:打开|开启|开)/;
const GIMBAL_MOVE_RE =
  /(?:吊舱|云台|镜头).{0,8}(?:向|往)?(左|右|上|下).{0,8}(?:转|挪|移动|动).{0,6}(?:(?:一|1)\s*秒|一下)?/;
const LASER_RANGE_RE = /(?:测|量).{0,4}(?:距离|间距)|(?:激光)?测距/;
const NEGATION_RE = /(?:不要|别|先别|无需|不用|禁止|别再|不要再)/;
const QUERY_RE = /(?:吗|么|是否|有没有|状态|开了吗|关了吗|当前|现在|多少|几)/;

function inspectionWaypoint(utterance: string): string {
  if (/充电桩|dock/i.test(utterance)) return "dock";
  if (/门口|通道/.test(utterance)) return "gate";
  return "dock";
}

function gimbalDirection(utterance: string): "left" | "right" | "up" | "down" {
  if (/右/.test(utterance)) return "right";
  if (/上/.test(utterance)) return "up";
  if (/下/.test(utterance)) return "down";
  return "left";
}

export function tryStructuralIntentOverride(
  utterance: string,
  _history?: readonly StructuralHistoryTurn[],
): IntentPayload | null {
  if (NEGATION_RE.test(utterance) || QUERY_RE.test(utterance)) return null;

  if (STOP_ALARM_RE.test(utterance)) {
    return {
      skill: "robot.stop_alarm",
      target: {},
    };
  }
  if (INSPECTION_RE.test(utterance)) {
    return {
      skill: "robot.start_inspection",
      target: {},
      parameters: {
        waypoint_id: inspectionWaypoint(utterance),
        source: /吊舱|云台|热成像/.test(utterance) ? "gimbal" : "body",
        objective: "巡检取证",
      },
    };
  }
  if (WORK_LIGHT_RE.test(utterance)) {
    return {
      skill: "robot.set_light",
      target: {},
      parameters: { light: "work", state: "on" },
    };
  }
  if (LASER_RANGE_RE.test(utterance)) {
    return {
      skill: "robot.gimbal_laser_range",
      target: {},
    };
  }
  if (GIMBAL_MOVE_RE.test(utterance)) {
    return {
      skill: "robot.gimbal_move",
      target: {},
      parameters: {
        direction: gimbalDirection(utterance),
        ...(/(?:一|1)\s*秒/.test(utterance) ? { duration_ms: 1000 } : {}),
      },
    };
  }
  if (FORWARD_MOVE_RE.test(utterance) && !/吊舱|云台|镜头/.test(utterance)) {
    return {
      skill: "robot.move",
      target: {},
      parameters: { x: 0.2, duration_ms: 1000 },
    };
  }
  if (GIMBAL_CAPTURE_RE.test(utterance)) {
    const mode = /可见光|visible/.test(utterance)
      ? "visible"
      : /热成像|红外|thermal/.test(utterance)
        ? "thermal"
        : "both";
    return {
      skill: "robot.gimbal_capture",
      target: {},
      parameters: { mode },
    };
  }
  if (BODY_CAPTURE_RE.test(utterance) && !/吊舱|云台|热成像/.test(utterance)) {
    return {
      skill: "robot.capture_image",
      target: {},
      parameters: { source: "body" },
    };
  }
  return null;
}
