import type { IntentPayload } from "@embodied-agent/core";
import { resolveSceneForTrigger } from "./registry.js";

const POST_IRRIGATION_VENT_SECONDS = 600;

export type GreenhousePostIrrigationCommand = {
  action: string;
  device_type?: string;
};

export type GreenhousePostIrrigationPlan = {
  templateText: string;
  intent: IntentPayload;
  sceneSkillId: string;
};

export function isGreenhousePostIrrigationCommand(
  command: GreenhousePostIrrigationCommand,
): boolean {
  return command.action === "start" && command.device_type === "irrigation_valve";
}

export function buildGreenhousePostIrrigationVentilationPlan(
  greenhouseId: string,
): GreenhousePostIrrigationPlan | null {
  const sceneSkillId = resolveSceneForTrigger({
    type: "irrigation_completed",
  });
  if (!sceneSkillId) return null;

  return {
    templateText:
      `【浇水后通风】${greenhouseId} 灌溉已完成，建议开通风 10 分钟降湿。` +
      "回复「确认」执行，或「取消」忽略。",
    intent: {
      skill: "greenhouse.open_vent",
      target: { greenhouse_id: greenhouseId },
      parameters: { duration_seconds: POST_IRRIGATION_VENT_SECONDS },
      confidence: 0.9,
    },
    sceneSkillId,
  };
}
