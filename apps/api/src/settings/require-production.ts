import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isEncryptedSecret,
  isValidDeploymentIdSegment,
  resolveAgentDataDir,
  validateFileLockStaleConfig,
} from "@embodied-agent/platform";
import { nodeTokensFileHasPlaintextSecrets } from "@embodied-agent/node";
import { validateRedisLockConfig } from "../state/redis-lock.js";
import { isExplicitDevEnv } from "../runtime/env-mode.js";
import { settingsHasPlaintextSecrets } from "./secrets-at-rest.js";
import { readAdminTokenSection } from "./admin-tokens.js";

const DEV_ADMIN_TOKEN = "dev-admin";

function fileHasPlaintextSecrets(): boolean {
  const path = join(resolveAgentDataDir(), "settings.json");
  if (!existsSync(path)) return false;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    return settingsHasPlaintextSecrets(parsed);
  } catch {
    return false;
  }
}

function dataRootHasPlaintextNodeTokens(dataRoot: string): boolean {
  const deploymentsDir = join(dataRoot, "deployments");
  if (!existsSync(deploymentsDir)) return false;
  for (const entry of readdirSync(deploymentsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !isValidDeploymentIdSegment(entry.name)) continue;
    const path = join(deploymentsDir, entry.name, "node-tokens.json");
    if (nodeTokensFileHasPlaintextSecrets(path)) return true;
  }
  return false;
}

export function requireProductionSecrets(): void {
  validateFileLockStaleConfig();
  validateRedisLockConfig();
  if (isExplicitDevEnv()) return;

  // /metrics 默认不鉴权；生产须显式选 scrape token 或允许公开（依赖网络隔离）。
  const metricsToken = process.env.METRICS_SCRAPE_TOKEN?.trim();
  const metricsAllowPublic = process.env.METRICS_ALLOW_PUBLIC?.trim() === "1";
  if (!metricsToken && !metricsAllowPublic) {
    throw new Error(
      "生产环境须设置 METRICS_SCRAPE_TOKEN（推荐）或显式 METRICS_ALLOW_PUBLIC=1（依赖网络隔离）；禁止默认可匿名 scrape。",
    );
  }

  const adminToken = process.env.ADMIN_TOKEN?.trim();
  // 与 resolveAdminTokenCandidates 同口径：无 AGENT_SECRETS_KEY 时未解密的
  // 密文 token 不可用作鉴权，不计入生产可用 admin auth。
  const settingsAdminTokens = readAdminTokenSection();
  const legacyToken = settingsAdminTokens.admin_token?.trim();
  const hasSettingsAdminAuth =
    Boolean(legacyToken && !isEncryptedSecret(legacyToken)) ||
    (settingsAdminTokens.admin_tokens ?? []).some(
      (entry) => !entry.disabled && entry.token.trim() && !isEncryptedSecret(entry.token),
    );
  if (!adminToken && !hasSettingsAdminAuth) {
    throw new Error(
      "生产环境须设置 ADMIN_TOKEN 环境变量或在 settings.json 配置 admin_tokens，禁止使用默认 dev-admin。",
    );
  }
  if (adminToken === DEV_ADMIN_TOKEN) {
    throw new Error("生产环境 ADMIN_TOKEN 不能为 dev-admin，请设置强随机令牌。");
  }
  if (fileHasPlaintextSecrets() && !process.env.AGENT_SECRETS_KEY?.trim()) {
    throw new Error(
      "生产环境禁止在 settings.json 明文存储密钥；请改用环境变量（save_target=env_required）或设置 AGENT_SECRETS_KEY。",
    );
  }
  if (
    dataRootHasPlaintextNodeTokens(resolveAgentDataDir()) &&
    !process.env.AGENT_SECRETS_KEY?.trim()
  ) {
    throw new Error(
      "生产环境禁止在 node-tokens.json 明文存储 node_token；请设置 AGENT_SECRETS_KEY。",
    );
  }
}
