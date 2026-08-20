import { adminFetch } from "./admin-fetch.js";

// Generic bindings support (for English / international platforms like WhatsApp)
export type Binding = {
  platform: string;
  platform_user_id: string;
  principal_user_id: string;
  bound_at: string;
};

export function listBindings(): Promise<{ bindings: Binding[] }> {
  return adminFetch("/admin/bindings");
}

export function issueBindingCode(
  principal_user_id: string,
  ttl_minutes?: number,
): Promise<{
  ok: boolean;
  code: string;
  principal_user_id: string;
  expires_at: string;
}> {
  return adminFetch("/admin/bindings/issue-code", {
    method: "POST",
    body: JSON.stringify({ principal_user_id, ttl_minutes }),
  });
}

export function claimBindingCode(
  code: string,
  platform: string,
  platform_user_id: string,
): Promise<{
  ok: boolean;
  binding: Binding;
}> {
  return adminFetch("/admin/bindings/claim", {
    method: "POST",
    body: JSON.stringify({ code, platform, platform_user_id }),
  });
}

export function manualBind(
  platform: string,
  platform_user_id: string,
  principal_user_id: string,
): Promise<{
  ok: boolean;
  binding: Binding;
}> {
  return adminFetch("/admin/bindings", {
    method: "POST",
    body: JSON.stringify({ platform, platform_user_id, principal_user_id }),
  });
}

/**
 * 解除 WeChat 绑定连接（/start 角色：unbind API）。
 *
 * - 不传 principal_user_id → 服务端 默 认 self-unbind (web session -> self.user_id)
 * - 仅 admin 可传 入 任意 principal_user_id  (需 admin session 或 x-admin-token)
 *
 * 返回：{ ok, removed, was_connected, principal_user_id }
 *                          ^ bool 是否 platform-binding 行 被 删
 *                                  ^ 该 principal 原本 是否 已 bind
 */
export function unbindWechat(principal_user_id?: string): Promise<{
  ok: boolean;
  removed: boolean;
  was_connected: boolean;
  principal_user_id: string;
}> {
  return adminFetch("/admin/wechat/binding", {
    method: "DELETE",
    body: JSON.stringify(principal_user_id ? { principal_user_id } : {}),
  });
}
