import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomInt } from "node:crypto";
import {
  atomicWriteJson,
  deploymentScopedPath,
  resolveAgentDataDir as dataRoot,
} from "@embodied-agent/platform";
import { loadRegistry } from "../registry/store.js";

const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford：去掉 I/L/O/U
const CODE_LENGTH = 8; // 32^8 ≈ 1.1e12，约 40 bit
const MAX_TTL_MINUTES = 1440;
const MAX_ACTIVE_CODES = 20;

export type NodeInstallCodeEntry = {
  install_code: string;
  deployment_id: string;
  entity_id?: string;
  node_id?: string;
  expires_at: string;
};

export type IssueNodeInstallCodeParams = {
  deployment_id: string;
  entity_id?: string;
  ttl_minutes?: number;
  node_id?: string;
};

type InstallCodesFile = {
  codes: NodeInstallCodeEntry[];
};

function requireDeploymentId(deployment_id: string): string {
  const trimmed = deployment_id.trim();
  if (!trimmed) throw new Error("missing_deployment_id");
  return trimmed;
}

function installCodesPath(deployment_id: string): string {
  return deploymentScopedPath(
    dataRoot(),
    requireDeploymentId(deployment_id),
    "node-install-codes.json",
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

function readInstallCodes(path: string): InstallCodesFile {
  const file = readJson<InstallCodesFile>(path, { codes: [] });
  if (!Array.isArray(file.codes)) {
    throw new Error(`${path} 无法读取或校验失败：codes must be an array`);
  }
  return file;
}

function generateInstallCode(): string {
  let body = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    body += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]!;
  }
  return `DF-${body}`;
}

/**
 * 管理员生成一次性安装码，绑定目标 deployment/entity。
 * 安装码只允许节点进入 pending，不直接激活控制。
 */
export function issueNodeInstallCode(params: IssueNodeInstallCodeParams): NodeInstallCodeEntry {
  const { deployment_id, entity_id } = params;
  const node_id = params.node_id?.trim() || undefined;
  const ttlMinutes = params.ttl_minutes ?? 30;
  const deploymentId = requireDeploymentId(deployment_id);

  if (ttlMinutes < 1 || ttlMinutes > MAX_TTL_MINUTES) {
    throw new Error(`ttl_minutes 必须在 1..${MAX_TTL_MINUTES}`);
  }

  const registry = loadRegistry();
  const deployment = registry.deployments.find((d) => d.deployment_id === deploymentId);
  if (!deployment) {
    throw new Error(`unknown deployment_id: ${deploymentId}`);
  }
  if (entity_id) {
    const entity = registry.entities.find((e) => e.entity_id === entity_id);
    if (!entity || entity.deployment_id !== deploymentId) {
      throw new Error(`entity ${entity_id} 不属于 deployment ${deploymentId} 或不存在`);
    }
  }

  const path = installCodesPath(deploymentId);
  const file = readInstallCodes(path);
  const now = Date.now();
  // 清理过期
  const active = file.codes.filter((c) => new Date(c.expires_at).getTime() > now);

  if (active.length >= MAX_ACTIVE_CODES) {
    throw new Error("too_many_active_install_codes");
  }

  const install_code = generateInstallCode();
  const entry: NodeInstallCodeEntry = {
    install_code,
    deployment_id: deploymentId,
    entity_id,
    ...(node_id ? { node_id } : {}),
    expires_at: new Date(now + ttlMinutes * 60_000).toISOString(),
  };
  active.push(entry);
  writeJson(path, { codes: active });
  return entry;
}

/**
 * 节点使用安装码注册时调用：校验有效性并消费（一次性）。
 * 返回绑定的场景信息。
 */
export function claimNodeInstallCode(
  deployment_id: string,
  install_code: string,
  node_id: string,
): {
  deployment_id: string;
  entity_id?: string;
} {
  const deploymentId = requireDeploymentId(deployment_id);
  const nodeId = node_id.trim();
  const path = installCodesPath(deploymentId);
  const file = readInstallCodes(path);
  const now = Date.now();
  const hit = file.codes.find(
    (c) =>
      c.deployment_id === deploymentId &&
      c.install_code === install_code.trim() &&
      new Date(c.expires_at).getTime() > now &&
      (!c.node_id || c.node_id === nodeId),
  );
  if (!hit) {
    throw new Error("invalid_or_expired_install_code");
  }
  const remaining = file.codes.filter((c) => c.install_code !== hit.install_code);
  writeJson(path, { codes: remaining });
  return { deployment_id: hit.deployment_id, entity_id: hit.entity_id };
}

/** 供管理后台或调试列出当前有效安装码（不暴露给节点） */
export function listActiveInstallCodes(deployment_id: string): NodeInstallCodeEntry[] {
  const deploymentId = requireDeploymentId(deployment_id);
  const file = readInstallCodes(installCodesPath(deploymentId));
  const now = Date.now();
  return file.codes.filter(
    (c) => c.deployment_id === deploymentId && new Date(c.expires_at).getTime() > now,
  );
}
