import type { DeploymentContext } from "./types.js";

export function formatDeploymentContext(ctx: DeploymentContext): string {
  const sceneContext = ctx.scene_context_sections.join("\n\n");
  return `${sceneContext}
${ctx.weather_snippet ? `\n当前天气预报摘要：${ctx.weather_snippet}` : ""}
${ctx.modes_summary ? `\n场内环控模式：${ctx.modes_summary}` : ""}
${ctx.active_alerts?.length ? `\n已设报警阈值：${ctx.active_alerts.join("；")}` : ""}`;
}

/** LLM target 不再包含 deployment_id；平台查询用空对象。 */
export function deploymentTargetJson(_ctx: DeploymentContext): string {
  return "{}";
}
