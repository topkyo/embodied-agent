import type { AgentRuntimeBindings } from "./runtime-bindings.js";
import type { MetricsRecorder } from "@embodied-agent/platform";

/**
 * Agent 运行时上下文：显式携带进程级装配产物 bindings 与可选 metrics。
 * 替代旧的模块级 defaultAgentHolder 全局状态；由组合根（apps/api / scripts / tests）
 * 显式创建并注入到 agent 包入口函数。
 */
export type AgentRuntimeContext = {
  bindings: AgentRuntimeBindings;
  metrics?: MetricsRecorder;
};

export function createAgentRuntimeContext(
  bindings: AgentRuntimeBindings,
  metrics?: MetricsRecorder,
): AgentRuntimeContext {
  return { bindings, metrics };
}
