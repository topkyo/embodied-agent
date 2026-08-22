import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { atomicWriteJson } from "@embodied-agent/platform";
import { upsertBinding } from "../../apps/api/src/auth/platform-bind.js";

const FLYWHEEL_PILOT_USER_IDS = ["owner-001", "worker-001"] as const;

export const FLYWHEEL_PLATFORM_USER = "wx-flywheel-dev";
export const FLYWHEEL_FARM_USER = "owner-001";
export const FLYWHEEL_WECHAT_ACCOUNT = "flywheel-dev";

const FLYWHEEL_SIM_NODES = ["node-sim-gh-001", "node-sim-gh-002"] as const;
const FLYWHEEL_GREENHOUSES = ["gh-001", "gh-002"] as const;

export function seedFlywheelWechatFixture(deploymentDir: string): void {
  process.env.AGENT_DATA_DIR = deploymentDir;
  mkdirSync(deploymentDir, { recursive: true });

  const wechatDir = resolve(deploymentDir, "wechat-ilink");
  mkdirSync(wechatDir, { recursive: true });
  atomicWriteJson(resolve(wechatDir, `${FLYWHEEL_WECHAT_ACCOUNT}.json`), {
    account_id: FLYWHEEL_WECHAT_ACCOUNT,
    token: "flywheel-dev-token",
    base_url: "http://127.0.0.1:9",
    principal_user_id: FLYWHEEL_FARM_USER,
    saved_at: new Date().toISOString(),
  });

  upsertBinding("wechat", FLYWHEEL_PLATFORM_USER, FLYWHEEL_FARM_USER);
  ensureFlywheelPilotUsersOnDisk(deploymentDir, "dep-gh-pilot-001");
}

/** digestRecipientsForDeployment 要求 user.deployment_id 与 pilot 租户一致。 */
export function ensureFlywheelPilotUsersOnDisk(
  deploymentDir: string,
  deploymentId = "dep-gh-pilot-001",
): void {
  const path = resolve(deploymentDir, "users.json");
  if (!existsSync(path)) return;
  try {
    const map = JSON.parse(readFileSync(path, "utf8")) as Record<
      string,
      { deployment_id?: string }
    >;
    let changed = false;
    for (const userId of FLYWHEEL_PILOT_USER_IDS) {
      const row = map[userId];
      if (row && row.deployment_id !== deploymentId) {
        row.deployment_id = deploymentId;
        changed = true;
      }
    }
    if (changed) atomicWriteJson(path, map);
  } catch {
    /* 飞轮不阻断：API upsert 仍会尝试对齐 */
  }
}

/** 清掉会污染飞轮 e2e 的本地状态（pending / sustained），避免秒级命中旧 L2 */
export function resetFlywheelRunState(
  deploymentDir: string,
  deploymentId = "dep-gh-pilot-001",
): void {
  atomicWriteJson(resolve(deploymentDir, "pending-confirm.json"), []);
  atomicWriteJson(resolve(deploymentDir, "deployments", deploymentId, "alert-rules.json"), {
    rules: [],
  });
  const sustainedPath = resolve(
    deploymentDir,
    "deployments",
    deploymentId,
    "sustained-anomaly-state.json",
  );
  mkdirSync(resolve(deploymentDir, "deployments", deploymentId), { recursive: true });
  writeFileSync(sustainedPath, `${JSON.stringify({ episodes: {} }, null, 2)}\n`);
  const cooldownPath = resolve(deploymentDir, "deployments", deploymentId, "alert-cooldown.json");
  if (existsSync(cooldownPath)) {
    try {
      const raw = JSON.parse(readFileSync(cooldownPath, "utf8")) as {
        last_fired?: Record<string, string>;
      };
      const last = raw.last_fired ?? {};
      for (const key of Object.keys(last)) {
        if (
          key.startsWith("sustained-l1:") ||
          key.startsWith("sustained-l2:") ||
          key.startsWith("sustained-humidity-l2:")
        ) {
          delete last[key];
        }
      }
      writeFileSync(cooldownPath, `${JSON.stringify({ last_fired: last }, null, 2)}\n`);
    } catch {
      writeFileSync(cooldownPath, `${JSON.stringify({ last_fired: {} }, null, 2)}\n`);
    }
  }

  const telemetryPath = resolve(deploymentDir, "deployments", deploymentId, "telemetry-state.json");
  if (!existsSync(telemetryPath)) return;
  try {
    const state = JSON.parse(readFileSync(telemetryPath, "utf8")) as {
      deviceReadings?: unknown[];
      cache?: { entity_id: string }[];
      heartbeats?: { node_id: string }[];
    };
    const simNodes = new Set<string>(FLYWHEEL_SIM_NODES);
    const simGhs = new Set<string>(FLYWHEEL_GREENHOUSES);
    writeFileSync(
      telemetryPath,
      `${JSON.stringify(
        {
          deviceReadings: state.deviceReadings ?? [],
          cache: (state.cache ?? []).filter((t) => !simGhs.has(t.entity_id)),
          heartbeats: (state.heartbeats ?? []).filter((h) => !simNodes.has(h.node_id)),
        },
        null,
        2,
      )}\n`,
    );
  } catch {
    writeFileSync(
      telemetryPath,
      `${JSON.stringify({ deviceReadings: [], cache: [], heartbeats: [] }, null, 2)}\n`,
    );
  }
}

export function readSettingsFlags(deploymentDir: string): {
  llm_api_key: boolean;
  alert_push_enabled: boolean;
  nlg_enabled: boolean;
} {
  const path = resolve(deploymentDir, "settings.json");
  if (!existsSync(path)) {
    return {
      llm_api_key: Boolean(process.env.LLM_API_KEY?.trim()),
      alert_push_enabled: true,
      nlg_enabled: true,
    };
  }
  try {
    const s = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    return {
      llm_api_key: Boolean(s.llm_api_key) || Boolean(process.env.LLM_API_KEY?.trim()),
      alert_push_enabled: s.alert_push_enabled !== false,
      nlg_enabled: s.nlg_enabled !== false,
    };
  } catch {
    return {
      llm_api_key: Boolean(process.env.LLM_API_KEY?.trim()),
      alert_push_enabled: true,
      nlg_enabled: true,
    };
  }
}
