import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import {
  atomicWriteJson,
  deploymentScopedPath,
  isEncryptedSecret,
  maybeDecryptSecret,
  maybeEncryptSecret,
  resolveAgentDataDir as dataRoot,
  safeEqualString,
} from "@embodied-agent/platform";

export type NodeTokenRecord = {
  deployment_id: string;
  node_id: string;
  token: string;
  issued_at: string;
};

type TokensFile = {
  tokens: NodeTokenRecord[];
};

function requireId(name: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`missing_${name}`);
  return trimmed;
}

function tokensPath(deployment_id: string): string {
  return deploymentScopedPath(
    dataRoot(),
    requireId("deployment_id", deployment_id),
    "node-tokens.json",
  );
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (e) {
    throw new Error(`${path} 无法读取或校验失败：${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  atomicWriteJson(path, data);
}

function readTokens(path: string): TokensFile {
  const file = readJson<TokensFile>(path, { tokens: [] });
  if (!Array.isArray(file.tokens)) {
    throw new Error(`${path} 无法读取或校验失败：tokens must be an array`);
  }
  return file;
}

export function tokensFileHasPlaintextSecrets(file: TokensFile): boolean {
  return file.tokens.some(
    (row) => typeof row.token === "string" && row.token.trim() && !isEncryptedSecret(row.token),
  );
}

export function nodeTokensFileHasPlaintextSecrets(path: string): boolean {
  if (!existsSync(path)) return false;
  return tokensFileHasPlaintextSecrets(readTokens(path));
}

export function issueNodeToken(deployment_id: string, node_id: string): string {
  const deploymentId = requireId("deployment_id", deployment_id);
  const nodeId = requireId("node_id", node_id);
  const path = tokensPath(deploymentId);
  const file = readTokens(path);
  // 发行明文只回显一次；落盘优先 AGENT_SECRETS_KEY 加密（AES-256-GCM）。
  // hash/JWT 只存摘要在双向共享密钥模型下收益不足，已关闭（见 RELEASE-v0.10.0 / AGENTS）。
  const token = "node_" + randomBytes(24).toString("base64url");
  const storedToken = maybeEncryptSecret(token) ?? token;
  const next = file.tokens.filter((t) => t.node_id !== nodeId);
  next.push({
    deployment_id: deploymentId,
    node_id: nodeId,
    token: storedToken,
    issued_at: new Date().toISOString(),
  });
  writeJson(path, { tokens: next });
  return token;
}

export function validateNodeToken(deployment_id: string, node_id: string, token: string): boolean {
  const file = readTokens(tokensPath(deployment_id));
  const rec = file.tokens.find((t) => t.node_id === node_id.trim());
  if (!rec) return false;
  const stored = maybeDecryptSecret(rec.token) ?? rec.token;
  return safeEqualString(stored, token);
}

export function getNodeToken(deployment_id: string, node_id: string): string | null {
  const file = readTokens(tokensPath(deployment_id));
  const stored = file.tokens.find((t) => t.node_id === node_id.trim())?.token;
  if (!stored) return null;
  return maybeDecryptSecret(stored) ?? stored;
}

/** 供管理吊销等（当前仅删除记录） */
export function revokeNodeToken(deployment_id: string, node_id: string): void {
  const path = tokensPath(deployment_id);
  const file = readTokens(path);
  writeJson(path, {
    tokens: file.tokens.filter((t) => t.node_id !== node_id.trim()),
  });
}
