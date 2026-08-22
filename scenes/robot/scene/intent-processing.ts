import type { DomainPackIntentProcessing, IntentPayload } from "@embodied-agent/core";
import { ROBOT_PHYSICAL_SKILLS } from "../skills.js";

const ROBOT_CONTROL_SKILLS = new Set<string>(ROBOT_PHYSICAL_SKILLS);
const WORK_LIGHT_STATUS_RE =
  /(?:工作灯|照明灯).{0,6}(?:状态|开了吗|关了吗|是否|有没有)|(?:状态|开了吗|关了吗|是否|有没有).{0,6}(?:工作灯|照明灯)/;
const NEGATION_RE = /(?:不要|别|先别|无需|不用|禁止|别再|不要再)/;

function robotDisambiguationRules(_deploymentTarget: string): string {
  return `规则：
1. 将用户消息映射为 robot.* skill、target（必须是对象）、parameters；禁止输出 GPIO、MQTT、继电器等字段。
2. 当前机器人 target 可省略或使用 {"robot_id":"m20-001"}；省略时平台使用 domain_configs.robotics.default_robot_id。
3. “状态/电量/故障/姿态/导航状态/现场图/直播地址/喊话器/吊舱状态”走 robot.query_* / capture_image / get_stream_url，不要输出控制技能。
4. “往前/后/左/右走一段/挪一下”走 robot.move，必须给 duration_ms 或 distance_m；“去某点/到充电桩/导航到”走 robot.navigate_to_waypoint 且必须使用已配置 waypoint_id。
5. “说一句/播报”走 robot.speak；“播放音频/停止音频”走 robot.play_audio / robot.stop_audio。
6. “开灯/爆闪/红蓝灯”走 robot.set_light；本体 LED 前后开关走 robot.set_body_led，front/back 只能用 1=开、0=关；“停止警报/关闭警报”走 robot.stop_alarm，不要解析为 alert.clear_threshold。
7. “云台/吊舱/镜头转动”走 robot.gimbal_*；“拍图”默认 robot.capture_image，只有明确云台/吊舱/热成像才把 source 设为 gimbal。
8. “巡检/去某点看看/取证”走 robot.start_inspection，必须给 waypoint_id。
9. 高风险动作（移动、导航、警报、爆闪/红蓝灯、吊舱转动/录像/激光测距）需要用户确认。`;
}

function robotIntentExamples(_deploymentTarget: string): string {
  return `示例（只输出 JSON，不要 markdown）：
{"skill":"robot.query_status","target":{},"confidence":0.95}
{"skill":"robot.move","target":{"robot_id":"m20-001"},"parameters":{"x":0.2,"duration_ms":1000},"confidence":0.9}
{"skill":"robot.navigate_to_waypoint","target":{},"parameters":{"waypoint_id":"dock"},"confidence":0.9}
{"skill":"robot.speak","target":{},"parameters":{"text":"巡检开始","voice":"male"},"confidence":0.9}
{"skill":"robot.capture_image","target":{},"parameters":{"source":"body"},"confidence":0.9}
{"skill":"robot.gimbal_move","target":{},"parameters":{"direction":"left","duration_ms":1000},"confidence":0.9}
{"skill":"robot.start_inspection","target":{},"parameters":{"waypoint_id":"yard","source":"gimbal","objective":"巡检取证"},"confidence":0.9}`;
}

function refineRobotIntentFromUtterance(utterance: string, intent: IntentPayload): IntentPayload {
  if (
    NEGATION_RE.test(utterance) &&
    ROBOT_CONTROL_SKILLS.has(intent.skill) &&
    intent.skill !== "robot.cancel_navigation" &&
    !intent.skill.startsWith("robot.stop_")
  ) {
    return {
      skill: "clarification_needed",
      target: {},
      clarification: "这是一个否定控制请求，请明确是查询状态、取消计划，还是停止正在执行的动作。",
    } as IntentPayload;
  }
  if (WORK_LIGHT_STATUS_RE.test(utterance)) {
    return {
      skill: "clarification_needed",
      target: {},
      clarification: "当前只支持设置工作灯，暂不支持查询工作灯状态。",
    } as IntentPayload;
  }
  if (intent.skill === "robot.start_inspection") {
    const parameters =
      intent.parameters && typeof intent.parameters === "object" ? { ...intent.parameters } : {};
    if (!parameters.source) parameters.source = "body";
    if (!parameters.objective) parameters.objective = "巡检取证";
    return { ...intent, parameters } as IntentPayload;
  }
  return intent;
}

function normalizeLedSwitchValue(value: unknown): unknown {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value > 0 ? 1 : 0;
  if (typeof value === "string") {
    if (/^(on|open|true|开|打开|开启)$/i.test(value.trim())) return 1;
    if (/^(off|close|false|关|关闭)$/i.test(value.trim())) return 0;
  }
  return value;
}

function normalizeRobotLlmShape(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const raw = data as Record<string, unknown>;
  if (raw.skill !== "robot.set_body_led" || !raw.parameters || typeof raw.parameters !== "object") {
    return data;
  }
  const parameters = { ...(raw.parameters as Record<string, unknown>) };
  parameters.front = normalizeLedSwitchValue(parameters.front);
  parameters.back = normalizeLedSwitchValue(parameters.back);
  return { ...raw, parameters };
}

function detectRobotSkillUtteranceConflict(utterance: string, skill: string): boolean {
  return WORK_LIGHT_STATUS_RE.test(utterance) && skill === "robot.query_status";
}

export const ROBOT_INTENT_PROCESSING: DomainPackIntentProcessing = {
  prompt: {
    parserPreamble:
      "你是具身 Agent「M20 机器人管家」的意图解析器。只输出一行 JSON，禁止 markdown、解释或思考过程，不控制硬件。",
    clarificationRule:
      '含糊目标或动作参数不足时，skill 设为 "clarification_needed" 并在 clarification 字段用中文追问。',
    disambiguationRules: robotDisambiguationRules,
    examples: robotIntentExamples,
  },
  normalizeUtterance: (text) => text.trim(),
  normalizeLlmShape: normalizeRobotLlmShape,
  refineIntentFromUtterance: refineRobotIntentFromUtterance,
  detectSkillUtteranceConflict: detectRobotSkillUtteranceConflict,
  isLowConfidenceControlSkill: (skill) => ROBOT_CONTROL_SKILLS.has(skill),
};
