import type { ReactNode } from "react";
import type { RobotControlGroupId } from "./control-actions";

export type ControlAction = {
  key: string;
  label: string;
  icon: ReactNode;
  skill: string;
  group: RobotControlGroupId;
  parameters?: Record<string, unknown>;
  confirm?: boolean;
};

/**
 * 执行反馈状态机：
 * idle → running → (success | error)
 * 确认走独立 confirmState，不阻塞 phase 递归。
 */
export type FeedbackPhase =
  | { status: "idle" }
  | { status: "running"; label: string; attempt: "initial" | "confirmed" }
  | { status: "success"; label: string; reply: string }
  | { status: "error"; message: string; retryAction?: ControlAction };

export type ConfirmState = null | {
  kind: "pre_confirm" | "server_409";
  action: ControlAction;
  reason?: string;
};

export type SchemaControlAction = {
  id: string;
  label: string;
  skill: string;
  physical: boolean;
  requires_confirmation: boolean;
  parameters?: Record<string, unknown>;
  display?: { title_zh?: string; title_en?: string };
};
