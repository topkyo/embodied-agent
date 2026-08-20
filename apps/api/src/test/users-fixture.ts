import { atomicWriteJson } from "@embodied-agent/platform";
import { dataRoot } from "../fs/deployment-path.js";
import type { UserRecord } from "../auth/user-store.js";
import { resolve } from "node:path";

export const DEFAULT_USERS: Record<string, UserRecord> = {
  "owner-001": {
    user_id: "owner-001",
    role: "owner",
    deployment_id: "dep-gh-pilot-001",
    display_name: "张老板",
  },
  "worker-001": {
    user_id: "worker-001",
    role: "worker",
    deployment_id: "dep-gh-pilot-001",
    display_name: "李工人",
  },
  "readonly-001": {
    user_id: "readonly-001",
    role: "readonly",
    deployment_id: "dep-gh-pilot-001",
    display_name: "访客只读",
  },
};

export function seedDefaultUsers(): void {
  atomicWriteJson(resolve(dataRoot(), "users.json"), DEFAULT_USERS);
}
