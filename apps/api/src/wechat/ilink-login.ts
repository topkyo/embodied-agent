import { randomUUID } from "node:crypto";
import { bindWechatPlatformUser, removeBinding } from "../auth/platform-bind.js";
import { useRedisSessionStore } from "../state/config.js";
import { readDeploymentId } from "./resolve-wechat-principal.js";
import {
  fetchBotQrcode,
  ILINK_DEFAULT_BASE_URL,
  pollQrcodeStatus,
  type QrStatus,
} from "./ilink-client.js";
import { saveWechatAccount } from "./ilink-store.js";
import { restartWechatBridge } from "./ilink-bridge.js";

const LOGIN_TTL_MS = 5 * 60_000;
const MAX_QR_REFRESH = 3;

export type LoginSession = {
  session_key: string;
  qrcode: string;
  qrcode_content: string;
  started_at: number;
  status: QrStatus;
  principal_user_id: string;
  /** Web user who started this bind flow (ownership gate for status poll). */
  started_by_user_id: string;
  domain?: string;
  refresh_count: number;
  message: string;
  platform_binding_ok?: boolean;
  binding_error?: string | null;
};

/**
 * 登录会话是进程内状态（单实例假设）。
 *
 * 扫码登录流程要求同一实例服务同一 session_key 的全部请求：
 * start 创建会话后，后续 status 轮询必须落在同一进程才能查到会话。
 * 多实例部署（如 Vercel / 水平扩容）下轮询可能落在其他实例，会话查不到，
 * 绑定流程会静默失败——因此该流程在多实例部署下不可用。
 * `startWechatLogin` 会在 STATE_BACKEND=redis（多实例部署意图）时直接抛错，
 * 而不是让轮询悬空。
 */
const sessions = new Map<string, LoginSession>();

function purgeExpired(): void {
  const now = Date.now();
  for (const [key, s] of sessions) {
    if (now - s.started_at > LOGIN_TTL_MS) sessions.delete(key);
  }
}

export function startWechatLogin(opts: {
  principal_user_id?: string;
  domain?: string;
  started_by_user_id?: string;
}): LoginSession {
  if (useRedisSessionStore()) {
    throw new Error(
      "微信扫码登录会话是进程内状态，多实例部署（STATE_BACKEND=redis）下不可用，需在单实例上执行绑定或后续实现共享会话存储。",
    );
  }
  purgeExpired();
  const principalUserId = opts.principal_user_id?.trim();
  if (!principalUserId) {
    throw new Error("principal_user_id is required");
  }
  const startedBy = opts.started_by_user_id?.trim();
  if (!startedBy) {
    throw new Error("started_by_user_id is required");
  }
  const domainPack = opts.domain?.trim() || undefined;
  const sessionKey = randomUUID();

  const session: LoginSession = {
    session_key: sessionKey,
    qrcode: "",
    qrcode_content: "",
    started_at: Date.now(),
    status: "wait",
    principal_user_id: principalUserId,
    started_by_user_id: startedBy,
    ...(domainPack ? { domain: domainPack } : {}),
    refresh_count: 0,
    message: "正在获取二维码…",
  };
  sessions.set(sessionKey, session);

  void (async () => {
    try {
      const qr = await fetchBotQrcode();
      session.qrcode = qr.qrcode;
      session.qrcode_content = qr.qrcode_img_content;
      session.message = "请使用微信扫描二维码，完成 ClawBot 绑定。";
    } catch (e) {
      session.message = `获取二维码失败：${e instanceof Error ? e.message : String(e)}`;
      session.status = "expired";
    }
  })();

  return session;
}

export async function waitForLoginQrcode(
  sessionKey: string,
  timeoutMs = 5_000,
): Promise<LoginSession | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const session = sessions.get(sessionKey) ?? null;
    if (!session) return null;
    if (session.qrcode_content || session.status === "expired") return session;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return sessions.get(sessionKey) ?? null;
}

export async function advanceWechatLogin(sessionKey: string): Promise<LoginSession | null> {
  purgeExpired();
  const session = sessions.get(sessionKey);
  if (!session?.qrcode) return session ?? null;

  if (Date.now() - session.started_at > LOGIN_TTL_MS) {
    sessions.delete(sessionKey);
    return {
      ...session,
      status: "expired",
      message: "二维码已过期，请点击重新生成。",
    };
  }

  try {
    const status = await pollQrcodeStatus(session.qrcode);
    session.status = status.status;

    if (status.status === "scaned") {
      session.message = "已扫码，请在微信中确认登录。";
      return session;
    }

    if (status.status === "expired") {
      session.refresh_count += 1;
      if (session.refresh_count > MAX_QR_REFRESH) {
        sessions.delete(sessionKey);
        return {
          ...session,
          message: "二维码多次过期，请重新生成。",
        };
      }
      const qr = await fetchBotQrcode();
      session.qrcode = qr.qrcode;
      session.qrcode_content = qr.qrcode_img_content;
      session.started_at = Date.now();
      session.status = "wait";
      session.message = "二维码已刷新，请重新扫描。";
      return session;
    }

    if (status.status === "confirmed") {
      const accountId = status.ilink_bot_id?.trim();
      const token = status.bot_token?.trim();
      if (!accountId || !token) {
        session.message = "登录确认失败：缺少 bot 凭证。";
        sessions.delete(sessionKey);
        return session;
      }

      const baseUrl = status.baseurl?.trim() || ILINK_DEFAULT_BASE_URL;
      const platformUserId = status.ilink_user_id?.trim() || accountId;

      const deploymentId = readDeploymentId();
      if (!deploymentId) {
        session.platform_binding_ok = false;
        session.binding_error = "deployment_id 未配置，无法写入 IM 绑定";
        session.message = `微信已连接，但 IM 绑定失败：${session.binding_error}`;
        sessions.delete(sessionKey);
        return session;
      }

      try {
        bindWechatPlatformUser(platformUserId, session.principal_user_id, deploymentId);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        session.platform_binding_ok = false;
        session.binding_error = err;
        session.message = `微信已连接，但 IM 绑定失败：${err}`;
        sessions.delete(sessionKey);
        return session;
      }

      try {
        saveWechatAccount({
          account_id: accountId,
          token,
          base_url: baseUrl,
          linked_user_id: platformUserId,
          principal_user_id: session.principal_user_id,
          saved_at: new Date().toISOString(),
        });
      } catch (e) {
        removeBinding("wechat", platformUserId);
        const err = e instanceof Error ? e.message : String(e);
        session.platform_binding_ok = false;
        session.binding_error = `保存微信账号失败：${err}`;
        session.message = `微信已连接，但 IM 绑定失败：${session.binding_error}`;
        sessions.delete(sessionKey);
        return session;
      }

      session.platform_binding_ok = true;
      session.binding_error = null;
      sessions.delete(sessionKey);
      restartWechatBridge();
      return {
        ...session,
        status: "confirmed",
        message: `✅ 微信 ClawBot 已连接，并绑定到 ${session.principal_user_id}。可直接在微信发指令试控。`,
      };
    }

    session.message = "等待扫码…";
    return session;
  } catch (e) {
    session.message = `状态查询失败：${e instanceof Error ? e.message : String(e)}`;
    return session;
  }
}

export function getLoginSession(sessionKey: string): LoginSession | null {
  purgeExpired();
  return sessions.get(sessionKey) ?? null;
}

export function wechatLoginPollFlags(view: {
  status: LoginSession["status"] | "idle";
  platform_binding_ok?: boolean | null;
}): {
  clawbot_connected: boolean;
  im_binding_ok: boolean;
  connected: boolean;
} {
  const clawbotConnected = view.status === "confirmed";
  const imBindingOk = view.platform_binding_ok === true;
  return {
    clawbot_connected: clawbotConnected,
    im_binding_ok: imBindingOk,
    connected: clawbotConnected && imBindingOk,
  };
}

export function publicLoginView(session: LoginSession | null) {
  if (!session) {
    return {
      session_key: randomUUID(),
      status: "idle" as const,
      message: "点击下方按钮生成二维码。",
      qrcode_content: null as string | null,
      principal_user_id: "",
    };
  }
  return {
    session_key: session.session_key,
    status: session.status,
    message: session.message,
    qrcode_content: session.qrcode_content || null,
    principal_user_id: session.principal_user_id,
    domain: session.domain ?? null,
    platform_binding_ok: session.platform_binding_ok ?? null,
    binding_error: session.binding_error ?? null,
  };
}
