import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  allocateAgentDataDir as allocatePlatformAgentDataDir,
  releaseAgentDataDir,
} from "@embodied-agent/platform";
import { clearEffectiveSettingsCacheForTest } from "../settings/store.js";

export { releaseAgentDataDir };

export function allocateAgentDataDir(label: string): string {
  const dir = allocatePlatformAgentDataDir(label);
  clearEffectiveSettingsCacheForTest();
  process.env.DEPLOYMENT_ID ??= "dep-gh-pilot-001";
  process.env.ACTIVE_DOMAIN ??= "agriculture";
  writeFileSync(
    join(dir, "settings.json"),
    JSON.stringify({
      deployment_id: process.env.DEPLOYMENT_ID,
      deployment_name: "test",
      llm_provider: "deepseek",
      llm_base_url: "https://api.deepseek.com/v1",
      llm_model: "deepseek-v4-flash",
      llm_thinking: false,
      stt_provider: "none",
      stt_model: "whisper-1",
      mqtt_url: "mqtt://127.0.0.1:1883",
      active_domain: process.env.ACTIVE_DOMAIN,
      domain_configs: {},
    }),
  );
  return dir;
}
