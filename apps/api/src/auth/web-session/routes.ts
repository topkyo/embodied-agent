import type { FastifyInstance } from "fastify";
import { isExplicitDevEnv } from "../../runtime/env-mode.js";
import { getInviteToken, issueInviteToken, redeemInviteToken } from "./invite.js";
import {
  attachWebSession,
  getWebSessionView,
  readSessionIdFromRequest,
  requireAdminSession,
  requireWebSession,
} from "./middleware.js";
import {
  buildSessionCookieValue,
  serializeClearSessionCookie,
  serializeSessionCookie,
  sessionTtlSeconds,
} from "./cookie.js";
import { destroyWebSession, touchWebSession } from "./session.js";
import {
  authenticateEmailPassword,
  createEmailAccount,
  establishSessionForAccount,
  redeemBootstrapInstallCode,
} from "./service.js";
import {
  findWebAccountByEmail,
  findWebAccountById,
  isBootstrapRedeemed,
  listWebAccounts,
  resolveBootstrapInstallCode,
  upsertWebAccount,
} from "./accounts.js";
import { assertPasswordPolicy, hashPassword } from "./password.js";

function setSessionCookie(
  reply: { header: (name: string, value: string) => unknown },
  cookieValue: string,
  isProd: boolean,
): void {
  reply.header("Set-Cookie", serializeSessionCookie(cookieValue, isProd));
}

function clearSessionCookie(
  reply: { header: (name: string, value: string) => unknown },
  isProd: boolean,
): void {
  reply.header("Set-Cookie", serializeClearSessionCookie(isProd));
}

export async function registerWebSessionHook(
  app: FastifyInstance,
  opts: { isProd: boolean },
): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    await attachWebSession(request);
    const session = request.webSession;
    if (!session) return;
    // 滑动续期：剩余有效期低于一半时延长存储 TTL 并重发 cookie，
    // 避免活跃用户被 15 分钟硬过期强制登出。
    const ttlMs = sessionTtlSeconds() * 1000;
    if (session.expires_at - Date.now() > ttlMs / 2) return;
    const renewed = await touchWebSession(session);
    request.webSession = renewed;
    reply.header(
      "Set-Cookie",
      serializeSessionCookie(buildSessionCookieValue(renewed.session_id), opts.isProd),
    );
  });
}

export async function registerWebAuthRoutes(
  app: FastifyInstance,
  opts: { isProd: boolean },
): Promise<void> {
  app.get("/auth/bootstrap-status", async () => {
    const configured = Boolean(resolveBootstrapInstallCode());
    const redeemed = isBootstrapRedeemed();
    return { available: configured && !redeemed, redeemed };
  });

  app.post<{
    Body: { email?: string; password?: string; display_name?: string; role?: string };
  }>("/auth/account/create", async (request, reply) => {
    if (!requireAdminSession(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const email = String(request.body?.email ?? "").trim();
    const password = String(request.body?.password ?? "");
    const displayName = String(request.body?.display_name ?? "").trim() || email;
    const role = request.body?.role === "admin" ? "admin" : "user";
    if (!email || !password) {
      return reply.status(400).send({ error: "missing_fields" });
    }
    try {
      const account = await createEmailAccount({
        email,
        password,
        display_name: displayName,
        role,
      });
      return { user_id: account.user_id, role: account.role, display_name: account.display_name };
    } catch (e) {
      const message = e instanceof Error ? e.message : "create_failed";
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{
    Body: { user_id?: string; password?: string; email?: string };
  }>("/auth/account/password", async (request, reply) => {
    if (!requireAdminSession(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const userId = String(request.body?.user_id ?? "").trim();
    const password = String(request.body?.password ?? "");
    const emailInput = String(request.body?.email ?? "")
      .trim()
      .toLowerCase();
    if (!userId || !password) {
      return reply.status(400).send({ error: "missing_fields" });
    }
    try {
      assertPasswordPolicy(password);
    } catch (e) {
      const message = e instanceof Error ? e.message : "password_too_short";
      return reply.status(400).send({ error: message });
    }
    const account = findWebAccountById(userId);
    if (!account) {
      return reply.status(404).send({ error: "user_not_found" });
    }
    const nextEmail = emailInput || account.email?.trim().toLowerCase() || "";
    if (!nextEmail) {
      return reply.status(400).send({ error: "email_required_for_login" });
    }
    if (emailInput) {
      const existing = findWebAccountByEmail(emailInput);
      if (existing && existing.user_id !== account.user_id) {
        return reply.status(400).send({ error: "email_already_exists" });
      }
    }
    await upsertWebAccount({
      user_id: account.user_id,
      role: account.role,
      display_name: account.display_name,
      email: nextEmail,
      password_hash: hashPassword(password),
    });
    return { ok: true };
  });

  app.get("/auth/accounts", async (request, reply) => {
    if (!requireAdminSession(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const accounts = listWebAccounts().map(({ password_hash: _ph, ...rest }) => rest);
    return { accounts };
  });

  app.post<{
    Body: { email?: string; password?: string };
  }>("/auth/email", async (request, reply) => {
    const email = String(request.body?.email ?? "").trim();
    const password = String(request.body?.password ?? "");
    if (!email || !password) {
      return reply.status(400).send({ error: "missing_fields" });
    }
    const account = await authenticateEmailPassword(email, password);
    if (!account) {
      return reply.status(401).send({ error: "invalid_credentials" });
    }
    const { cookieValue } = await establishSessionForAccount(account);
    setSessionCookie(reply, cookieValue, opts.isProd);
    return {
      user_id: account.user_id,
      role: account.role,
      display_name: account.display_name,
    };
  });

  app.post("/auth/logout", async (request, reply) => {
    const sessionId = readSessionIdFromRequest(request);
    if (sessionId) {
      await destroyWebSession(sessionId);
    }
    clearSessionCookie(reply, opts.isProd);
    return { ok: true };
  });

  app.get("/auth/me", async (request, reply) => {
    if (!requireWebSession(request)) {
      return reply.status(401).send({ error: "unauthenticated" });
    }
    return getWebSessionView(request);
  });

  app.post<{
    Body: {
      install_code?: string;
      display_name?: string;
      email?: string;
      password?: string;
    };
  }>("/auth/bootstrap", async (request, reply) => {
    const installCode = String(request.body?.install_code ?? "").trim();
    const email = String(request.body?.email ?? "").trim();
    const password = String(request.body?.password ?? "");
    const displayName =
      typeof request.body?.display_name === "string" ? request.body.display_name.trim() : undefined;
    if (!installCode || !email || !password) {
      return reply.status(400).send({ error: "missing_fields" });
    }
    const result = await redeemBootstrapInstallCode(installCode, {
      email,
      password,
      displayName,
    });
    if ("error" in result) {
      const status =
        result.error === "invalid_install_code"
          ? 401
          : result.error === "missing_fields" || result.error === "password_too_short"
            ? 400
            : 409;
      return reply.status(status).send({ error: result.error });
    }
    setSessionCookie(reply, result.cookieValue, opts.isProd);
    return {
      user_id: result.account.user_id,
      role: result.account.role,
      display_name: result.account.display_name,
    };
  });

  app.post<{
    Body: { role?: string };
  }>("/auth/invite", async (request, reply) => {
    if (!requireAdminSession(request)) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    const role = request.body?.role === "admin" ? "admin" : "user";
    const invite = await issueInviteToken(request.webSession!.user_id, role);
    return {
      token: invite.token,
      role: invite.role,
      expires_at: new Date(invite.expires_at).toISOString(),
      redeem_path: "/auth/invite/redeem",
    };
  });

  app.post<{
    Body: {
      token?: string;
      email?: string;
      password?: string;
      display_name?: string;
    };
  }>("/auth/invite/redeem", async (request, reply) => {
    const token = String(request.body?.token ?? "").trim();
    const email = String(request.body?.email ?? "").trim();
    const password = String(request.body?.password ?? "");
    const displayName = String(request.body?.display_name ?? "").trim() || email || undefined;
    if (!token || !email || !password) {
      return reply.status(400).send({ error: "missing_fields" });
    }
    const invite = await getInviteToken(token);
    if (!invite) {
      return reply.status(404).send({ error: "invalid_or_expired_invite" });
    }
    let account;
    try {
      account = await createEmailAccount({
        email,
        password,
        display_name: displayName || email,
        role: invite.role,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "create_failed";
      return reply.status(400).send({ error: message });
    }
    const redeemed = await redeemInviteToken(token, account.user_id);
    if (!redeemed) {
      return reply.status(409).send({ error: "invite_already_redeemed" });
    }
    const { cookieValue } = await establishSessionForAccount(account);
    setSessionCookie(reply, cookieValue, opts.isProd);
    return {
      user_id: account.user_id,
      role: account.role,
      display_name: account.display_name,
    };
  });
}

export async function registerWebAuthDevRoutes(app: FastifyInstance): Promise<void> {
  if (!isExplicitDevEnv()) return;
  app.post<{
    Body: {
      email?: string;
      password?: string;
      display_name?: string;
      role?: string;
    };
  }>("/auth/dev/create-user", async (request, reply) => {
    const email = String(request.body?.email ?? "").trim();
    const password = String(request.body?.password ?? "");
    const displayName = String(request.body?.display_name ?? "").trim() || email;
    const role = request.body?.role === "admin" ? "admin" : "user";
    if (!email || !password) {
      return reply.status(400).send({ error: "missing_fields" });
    }
    try {
      const account = await createEmailAccount({
        email,
        password,
        display_name: displayName,
        role,
      });
      return { ok: true, user_id: account.user_id, role: account.role };
    } catch (e) {
      const message = e instanceof Error ? e.message : "create_failed";
      return reply.status(400).send({ error: message });
    }
  });
}
