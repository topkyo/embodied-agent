import { AsyncLocalStorage } from "node:async_hooks";
import {
  createIntentResolver,
  type AgentRuntimeContext,
  type IntentResolver,
} from "@embodied-agent/agent";

/**
 * 进程级 AgentRuntimeContext / IntentResolver 持有者（基于 AsyncLocalStorage）。
 * 由 bindRuntimeLayers() / 脚本装配层在组合根装配时写入当前 async 上下文；
 * 调用方通过 getter 显式取用，替代 agent 包内已删除的模块级全局状态。
 */
const agentContextVar = new AsyncLocalStorage<AgentRuntimeContext>();
const resolverVar = new AsyncLocalStorage<IntentResolver>();

export function setAgentRuntimeContext(ctx: AgentRuntimeContext): void {
  agentContextVar.enterWith(ctx);
  resolverVar.enterWith(createIntentResolver(ctx));
}

export function getAgentRuntimeContext(): AgentRuntimeContext {
  const ctx = agentContextVar.getStore();
  if (!ctx) {
    throw new Error("AgentRuntimeContext 未设置：请先调用 bindRuntimeLayers()。");
  }
  return ctx;
}

export function getIntentResolver(): IntentResolver {
  const resolver = resolverVar.getStore();
  if (!resolver) {
    throw new Error("IntentResolver 未设置：请先调用 bindRuntimeLayers()。");
  }
  return resolver;
}
