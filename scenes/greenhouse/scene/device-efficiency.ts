import { resolveSceneForTrigger } from "./registry.js";

export type GreenhouseDeviceEfficiencyPlan = {
  templateText: string;
  sceneSkillId: string;
};

export function buildGreenhouseDeviceEfficiencyPlan(input: {
  deviceId: string;
  greenhouseId?: string;
  failureCount: number;
}): GreenhouseDeviceEfficiencyPlan | null {
  const sceneSkillId = resolveSceneForTrigger({
    type: "device_repeated_failure",
  });
  if (!sceneSkillId) return null;

  const label = input.greenhouseId ?? input.deviceId;
  return {
    sceneSkillId,
    templateText:
      `【设备诊断·${sceneSkillId}】${label} 近 24 小时指令失败 ${input.failureCount} 次，` +
      "建议检查节点在线、限位与手动优先状态。",
  };
}
