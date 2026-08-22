import type { UserRole } from "@embodied-agent/safety";
import type { MqttCommandPublisher } from "@embodied-agent/node";
import type { SceneSkillId } from "../scene/registry.js";

export type RouteContext = {
  user_id: string;
  role: UserRole;
  model: string;
  /** Original user utterance for safety-reject flywheel capture */
  utterance?: string;
  mqtt?: MqttCommandPublisher;
  conversation_id?: string;
  platform?: string;
  /** After user replies 确认 */
  skip_confirmation?: boolean;
  scene_skill_id?: SceneSkillId;
  user_confirmed?: boolean;
};
