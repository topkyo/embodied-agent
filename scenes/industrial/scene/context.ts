import type { DeviceRegistry } from "@embodied-agent/core";

export function buildIndustrialSceneContext(
  registry: DeviceRegistry,
  deployment_id: string,
  domainConfig?: unknown,
): { scene_context_sections: string[] } {
  const cabinets = registry.entities.filter(
    (entity) =>
      entity.deployment_id === deployment_id &&
      entity.domain_id === "industrial" &&
      entity.entity_type === "cabinet" &&
      entity.status === "active",
  );
  const cfg = (domainConfig ?? {}) as { default_cabinet_id?: string };
  const lines = cabinets.map((entity) => {
    const suffix = entity.entity_id === cfg.default_cabinet_id ? "（默认）" : "";
    return `- ${entity.entity_id}: ${entity.name}${suffix}`;
  });
  return {
    scene_context_sections: [
      lines.length > 0
        ? `工业配电柜/机房：\n${lines.join("\n")}`
        : "工业配电柜/机房：当前 registry 未注册 active cabinet entity。",
    ],
  };
}
