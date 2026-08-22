import type { FastifyInstance } from "fastify";
import { getWechatBridgeDiagnostics, isWechatBridgeRunning } from "../wechat/ilink-bridge.js";
import {
  advanceWechatLogin,
  getLoginSession,
  publicLoginView,
  startWechatLogin,
  waitForLoginQrcode,
  wechatLoginPollFlags,
} from "../wechat/ilink-login.js";
import { findPlatformBinding, listBindings, removeBinding } from "../auth/platform-bind.js";
import { loadPrimaryWechatAccount, listWechatAccounts } from "../wechat/ilink-store.js";
import { createLogger } from "@embodied-agent/platform";
import { requireAdmin } from "./admin-auth.js";
import { requireAdminSession, requireWebSession } from "../auth/web-session/middleware.js";

const log = createLogger("wechat-admin");

function buildFullWechatStatus() {
  const primary = loadPrimaryWechatAccount();
  const diag = getWechatBridgeDiagnostics();
  const linkedUserId = primary?.linked_user_id?.trim() ?? "";
  const platformBinding = linkedUserId ? findPlatformBinding("wechat", linkedUserId) : null;
  const clawbotConnected = Boolean(primary?.token);
  const imBindingOk = Boolean(platformBinding);
  return {
    clawbot_connected: clawbotConnected,
    im_binding_ok: imBindingOk,
    connected: clawbotConnected && imBindingOk,
    bridge_running: isWechatBridgeRunning(),
    last_poll_at: diag.last_poll_at,
    last_error: diag.last_error,
    account: primary
      ? {
          account_id: primary.account_id,
          linked_user_id: primary.linked_user_id,
          principal_user_id: primary.principal_user_id,
          saved_at: primary.saved_at,
        }
      : null,
    platform_binding: {
      ok: Boolean(platformBinding),
      platform_user_id: linkedUserId || null,
      principal_user_id: platformBinding?.principal_user_id ?? primary?.principal_user_id ?? null,
    },
    accounts: listWechatAccounts().map((a) => ({
      account_id: a.account_id,
      principal_user_id: a.principal_user_id,
      saved_at: a.saved_at,
    })),
  };
}

function buildSelfWechatStatus(userId: string) {
  const full = buildFullWechatStatus();
  const principal =
    full.account?.principal_user_id ?? full.platform_binding.principal_user_id ?? null;
  const isSelf = principal === userId;
  return {
    clawbot_connected: full.clawbot_connected,
    im_binding_ok: isSelf && full.im_binding_ok,
    connected: isSelf && full.connected,
    bridge_running: full.bridge_running,
    last_poll_at: full.last_poll_at,
    last_error: full.last_error,
    account: isSelf ? full.account : null,
    platform_binding: {
      ok: isSelf && full.platform_binding.ok,
      platform_user_id: isSelf ? full.platform_binding.platform_user_id : null,
      principal_user_id: isSelf ? userId : null,
    },
  };
}

export async function registerWechatAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/wechat/status", async (request, reply) => {
    if (requireAdmin(request)) {
      return buildFullWechatStatus();
    }
    if (requireWebSession(request) && request.webSession) {
      return buildSelfWechatStatus(request.webSession.user_id);
    }
    return reply.status(401).send({ error: "unauthorized" });
  });

  app.post<{ Body: { principal_user_id?: string; domain?: string } }>(
    "/admin/wechat/login/start",
    async (request, reply) => {
      if (!requireWebSession(request) || !request.webSession) {
        return reply.status(401).send({ error: "unauthorized" });
      }
      const sessionUserId = request.webSession.user_id;
      const isAdmin = requireAdminSession(request);
      const requestedPrincipal = request.body?.principal_user_id?.trim();
      // Non-admins always bind themselves; admins may bind any principal (default: self).
      const principalUserId = isAdmin ? requestedPrincipal || sessionUserId : sessionUserId;
      try {
        const session = startWechatLogin({
          principal_user_id: principalUserId,
          domain: request.body?.domain,
          started_by_user_id: sessionUserId,
        });
        const readySession = await waitForLoginQrcode(session.session_key);
        const view = publicLoginView(readySession ?? session);
        if (!view.qrcode_content && view.status === "expired") {
          return reply.status(503).send({
            ok: false,
            error: "qrcode_unavailable",
            ...view,
          });
        }
        return { ok: true, ...view };
      } catch (e) {
        return reply.status(503).send({
          ok: false,
          error: "wechat_login_failed",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    },
  );

  app.get<{ Querystring: { session_key?: string } }>(
    "/admin/wechat/login/status",
    async (request, reply) => {
      if (!requireWebSession(request) || !request.webSession) {
        return reply.status(401).send({ error: "unauthorized" });
      }
      const sessionKey = request.query.session_key?.trim();
      if (!sessionKey) {
        return reply.status(400).send({ ok: false, error: "session_key required" });
      }
      let session = getLoginSession(sessionKey);
      if (
        session &&
        !requireAdminSession(request) &&
        session.started_by_user_id !== request.webSession.user_id
      ) {
        return reply.status(403).send({ ok: false, error: "forbidden" });
      }
      if (session?.qrcode) {
        session = (await advanceWechatLogin(sessionKey)) ?? session;
      }
      const view = publicLoginView(session);
      const pollFlags = wechatLoginPollFlags(view);
      return {
        ok: true,
        ...view,
        ...pollFlags,
      };
    },
  );

  /**
   * 解除 WeChat 绑定连接（DELETE /admin/wechat/binding）。
   *
   * 访问策略：
   *   - admin (x-admin-token 或 admin session) → body 可指定 principal_user_id (揭晓 任一 principal)
   *   - 普通 web session → 必须 self：principal_user_id 等于 request.webSession.user_id
   *
   * 真源：扫描 platform-bindings.json 中 platform="wechat" 且 principal_user_id 命中 target 的 row，
   * 并对每行 removeBinding("wechat", platform_user_id)。
   * 注：这里不动 wechat-ilink-accounts.json（ilink token + linked_user_id 是 bridge 层 事）；
   * 解绑后 /admin/wechat/status 的 im_binding_ok 直接变 false，/start bind gate 失效，正在主绑 满面 QR。
   */
  app.delete<{ Body: { principal_user_id?: string } }>(
    "/admin/wechat/binding",
    async (request, reply) => {
      const sessionUserId = request.webSession?.user_id?.trim() || undefined;
      // admin 路径： admin session 或 x-admin-token；都 调 requireAdmin 拿 adminActor 并 标记
      const isAdmin = requireAdminSession(request) || requireAdmin(request);
      const body = (request.body ?? {}) as Record<string, unknown>;
      const requestedPrincipal =
        typeof body.principal_user_id === "string" ? body.principal_user_id.trim() : "";
      // 默认 推导：未指定 → 自己 (self unbind path)
      const principalToUnbind = (() => {
        if (isAdmin) {
          return requestedPrincipal || sessionUserId || "";
        }
        if (!sessionUserId) {
          return "";
        }
        // 非 admin 只能 自己；body 不接受 任意 override
        return requestedPrincipal && requestedPrincipal === sessionUserId
          ? sessionUserId
          : sessionUserId;
      })();
      if (!principalToUnbind) {
        return reply.status(401).send({ ok: false, error: "unauthorized" });
      }

      const wechatBindings = listBindings().filter(
        (b) => b.platform === "wechat" && b.principal_user_id === principalToUnbind,
      );
      const wasConnected = wechatBindings.length > 0;

      let removed = 0;
      try {
        for (const b of wechatBindings) {
          removeBinding("wechat", b.platform_user_id);
          removed += 1;
        }
      } catch (e) {
        log.error("wechat unbind failed", {
          principal_user_id: principalToUnbind,
          actor: sessionUserId,
          isAdmin,
          removed,
          error: e instanceof Error ? e.message : String(e),
        });
        return reply.status(500).send({
          ok: false,
          error: "unbind_failed",
          partial: removed,
          principal_user_id: principalToUnbind,
        });
      }

      log.info("wechat unbind", {
        principal_user_id: principalToUnbind,
        actor: sessionUserId,
        isAdmin,
        removed,
        was_connected: wasConnected,
      });
      return {
        ok: true,
        removed,
        was_connected: wasConnected,
        principal_user_id: principalToUnbind,
      };
    },
  );
}
