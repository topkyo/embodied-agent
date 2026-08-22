import type { RegistryDevice } from "./registry.js";

export interface SkillControlMeta {
  /** 控件形态：滑杆（目标百分比）或开关（启/停） */
  kind: "slider" | "toggle";
  /** 滑杆单位标签，如 "%"（开合度） */
  unit?: string;
  /** 演示层默认展示值（0-100 或 0/1），bound 层无遥测时显示 "—" */
  demo_value?: number;
}

export interface SkillDisplayMeta {
  /** 面向棚主/运维的中文名，如「开天窗」 */
  title_zh: string;
  /** lucide-react 图标名（web 端解析），如 "wind" */
  icon: string;
  /** 一句话说明，如「调节顶部通风」 */
  summary_zh?: string;
  /** 控制台技能卡控件形态；未声明时仅渲染执行按钮 */
  control?: SkillControlMeta;
}

export type BindNodeDeviceTemplate = {
  /**
   * device_id 模板，支持 `{node}` 占位符：绑定节点时替换为 node_id 去除 `node-` 前缀的 suffix，
   * 避免与当前 registry 冲突。
   */
  device_id: string;
  device_type: string;
  name: string;
  channel?: string;
  metrics?: readonly string[];
  default_for?: string;
  max_duration_seconds?: number;
  status?: string;
};

export type SceneResolvedDeviceTarget = {
  deployment_id: string;
  node_id: string;
  config_version?: number;
  transport?: string;
  device: RegistryDevice;
};

export type StructuralHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

export type SceneTrigger = {
  type: string;
  [key: string]: unknown;
};

export type RiskLevel = "L0" | "L1" | "L2" | "L3" | "L4";

export type OutcomeThresholds = {
  [key: string]: number | undefined;
};

export type SceneModeState = {
  entity_id: string;
  mode: string;
  until_iso?: string;
  updated_at?: string;
  updated_by?: string;
  [key: string]: unknown;
};

export type SceneTelemetrySlice = {
  entity_id: string;
  [key: string]: unknown;
};
