import type { CommandEvent, CommandMessage } from "@embodied-agent/core";
import type { TelemetrySnapshot } from "./telemetry-snapshot.js";

export type CommandLifecycleStatus = "created" | "sent" | CommandEvent["status"] | "timeout";

/** status ∈ {created, sent, acknowledged, running}：命令已生成未终结，用于下发前并发控制。 */
export const IN_FLIGHT_COMMAND_STATUSES: ReadonlySet<CommandLifecycleStatus> = new Set([
  "created",
  "sent",
  "acknowledged",
  "running",
]);

export type CommandRecord = {
  command_id: string;
  command: CommandMessage;
  status: CommandLifecycleStatus;
  created_at: string;
  updated_at: string;
  sent_at?: string;
  last_event_at?: string;
  retry_count?: number;
  last_retry_at?: string;
  /** config-sync 对齐失败次数（watcher 重试用） */
  config_sync_fail_count?: number;
  notified_status?: CommandLifecycleStatus;
  error?: {
    code: string;
    message: string;
  };
  result?: Record<string, unknown>;
  /** 数据飞轮 v0：动作前/后环境快照 */
  telemetry_flywheel?: {
    before?: TelemetrySnapshot;
    after?: TelemetrySnapshot;
    windows?: Array<{
      minutes: number;
      snapshot: TelemetrySnapshot;
      captured_at: string;
    }>;
  };
  /** L3 场景技能标注 */
  scene_skill_id?: string;
  risk_level?: string;
  user_confirmed?: boolean;
  /** 执行 transport，例如 mqtt 或 m20_http；用于区分证据口径。 */
  execution_transport?: string;
  /** lifecycle 事件来源：Scene Node MQTT 或 API direct executor 合成。 */
  lifecycle_source?: "scene_node_mqtt" | "api_domain_executor";
};
