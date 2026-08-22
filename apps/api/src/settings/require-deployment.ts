import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { dataRoot } from "../fs/deployment-path.js";
import { loadSettingsFile } from "./store.js";

export function requireExplicitDeploymentId(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.DEPLOYMENT_ID?.trim()) return;
  const base = dataRoot();
  const settingsPath = resolve(base, "settings.json");
  if (!existsSync(settingsPath)) {
    throw new Error(
      "生产环境须显式配置 DEPLOYMENT_ID 环境变量或 data/settings.json 中的 deployment_id。",
    );
  }
  const file = loadSettingsFile();
  if (!file.deployment_id?.trim()) {
    throw new Error(
      "生产环境须在 settings.json 中配置 deployment_id，或设置 DEPLOYMENT_ID 环境变量。",
    );
  }
}

export function requireExplicitActiveDomain(): void {
  if (process.env.NODE_ENV !== "production") return;
  const fromEnv = process.env.ACTIVE_DOMAIN?.trim();
  if (fromEnv) {
    if (fromEnv.includes(",")) {
      throw new Error("生产环境 ACTIVE_DOMAIN 只允许配置一个 Domain Pack id。");
    }
    return;
  }
  const base = dataRoot();
  const settingsPath = resolve(base, "settings.json");
  if (!existsSync(settingsPath)) {
    throw new Error(
      "生产环境须显式配置 ACTIVE_DOMAIN 环境变量或 data/settings.json 中的 active_domain。",
    );
  }
  const file = loadSettingsFile();
  if (!file.active_domain?.trim()) {
    throw new Error(
      "生产环境须在 settings.json 中配置 active_domain，或设置 ACTIVE_DOMAIN 环境变量。",
    );
  }
}
