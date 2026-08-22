import { adminFetch } from "./admin-fetch.js";

// Node install & binding (for Settings admin node management)
export type NodeInstallCode = {
  install_code: string;
  deployment_id: string;
  entity_id?: string;
  expires_at: string;
};

export function issueNodeInstallCode(
  deployment_id: string,
  entity_id?: string,
  ttl_minutes?: number,
  node_id?: string,
): Promise<{
  ok: boolean;
  install_code: string;
  deployment_id: string;
  entity_id?: string;
  expires_at: string;
}> {
  return adminFetch("/admin/node-install-codes", {
    method: "POST",
    body: JSON.stringify({ deployment_id, entity_id, ttl_minutes, node_id }),
  });
}

export function listNodeInstallCodes(): Promise<{ codes: NodeInstallCode[]; count: number }> {
  return adminFetch("/admin/node-install-codes");
}

export type AdminNode = {
  node_id: string;
  deployment_id: string;
  entity_id?: string;
  status: "pending" | "active" | "disabled" | "maintenance";
  config_version?: number;
  firmware_version?: string;
  registered_at?: string;
  /** registry 字段：绑定/激活时写入，不代表实时 MQTT 心跳 */
  last_seen_at?: string;
  /** 运行时在线态：90s 内有 heartbeat 为 true（与 status=active 解耦） */
  online?: boolean;
  reported_at?: string | null;
};

export function listAdminNodes(status?: string): Promise<{ nodes: AdminNode[]; count: number }> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return adminFetch(`/admin/nodes${q}`);
}

export type BindNodeDevice = {
  device_id: string;
  device_type: string;
  name: string;
  channel?: string;
  metrics?: string[];
  default_for?: string;
  max_duration_seconds?: number;
  status?: string;
  [k: string]: unknown;
};

export function bindAdminNode(
  node_id: string,
  body: { deployment_id: string; entity_id?: string; devices: BindNodeDevice[] },
): Promise<{
  ok: boolean;
  node: {
    node_id: string;
    status: string;
    config_version?: number;
    deployment_id: string;
    entity_id?: string;
  };
}> {
  return adminFetch(`/admin/nodes/${encodeURIComponent(node_id)}/binding`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function pairAdminNode(
  node_id: string,
  deployment_id: string,
  entity_id?: string,
  ttl_minutes?: number,
): Promise<{
  ok: boolean;
  node_id: string;
  install_code: string;
  deployment_id: string;
  entity_id?: string;
  expires_at: string;
  mqtt_published: boolean;
  pair_url: string;
}> {
  return adminFetch(`/admin/nodes/${encodeURIComponent(node_id)}/pair`, {
    method: "POST",
    body: JSON.stringify({ deployment_id, entity_id, ttl_minutes }),
  });
}

export type PrincipalUser = {
  user_id: string;
  role: "owner" | "operator" | "worker" | "viewer" | "readonly";
  deployment_id: string;
  display_name?: string;
};

export function listPrincipalUsers(): Promise<{ users: PrincipalUser[] }> {
  return adminFetch("/admin/users");
}

export function createPrincipalUser(
  user: PrincipalUser,
): Promise<{ ok: boolean; user: PrincipalUser }> {
  return adminFetch("/admin/users", {
    method: "POST",
    body: JSON.stringify(user),
  });
}

export function updatePrincipalUser(
  user_id: string,
  patch: Partial<PrincipalUser>,
): Promise<{ ok: boolean; user: PrincipalUser }> {
  return adminFetch(`/admin/users/${encodeURIComponent(user_id)}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export function deletePrincipalUser(user_id: string): Promise<{ ok: boolean }> {
  return adminFetch(`/admin/users/${encodeURIComponent(user_id)}`, {
    method: "DELETE",
  });
}
