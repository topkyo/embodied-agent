import type { DeploymentContext } from "@embodied-agent/agent";

export { getUsersMap, getUser, type UserRecord } from "../auth/users.js";

export const DEFAULT_DEPLOYMENT_CONTEXT: DeploymentContext = {
  scene_context_sections: [
    "温室 ID 对照：\n- gh-001: 1号棚、一号棚、1棚\n- gh-002: 2号棚、二号棚、2棚",
  ],
};
