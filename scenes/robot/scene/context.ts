import type { DeviceRegistry } from "@embodied-agent/core";
import type { M20ClientConfig } from "../m20/client.js";

export function buildRobotSceneContext(
  registry: DeviceRegistry,
  deployment_id: string,
  domainConfig?: unknown,
): { scene_context_sections: string[] } {
  const robots = registry.devices.filter(
    (d) =>
      d.deployment_id === deployment_id && d.device_type === "robot_dog" && d.status !== "disabled",
  );
  const lines = robots.map((d) => `- ${d.device_id}: ${d.name}`);
  const sections = [
    lines.length > 0
      ? `M20 机器狗设备：\n${lines.join("\n")}`
      : "M20 机器狗设备：当前 registry 未注册 robot_dog。",
  ];
  const waypoints = ((domainConfig ?? {}) as M20ClientConfig).waypoints ?? [];
  if (waypoints.length > 0) {
    sections.push(
      `M20 预设导航点位：\n${waypoints
        .map((w) => `- ${w.waypoint_id}${w.name ? `: ${w.name}` : ""}`)
        .join("\n")}`,
    );
  }
  return { scene_context_sections: sections };
}
