import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";

const API_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:3001";
const WEB_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";

function parseSessionCookie(setCookie: string | string[] | undefined): string | null {
  const raw = Array.isArray(setCookie) ? setCookie.join("; ") : setCookie;
  if (!raw) return null;
  const match = raw.match(/ea_session=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** Playwright 注入 TEST_PARALLEL_INDEX；未并行时为 0。 */
function parallelWorkerIndex(explicit?: number): number {
  if (explicit !== undefined) return explicit;
  const fromEnv = process.env.TEST_PARALLEL_INDEX;
  if (fromEnv !== undefined && fromEnv !== "") {
    const n = Number(fromEnv);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export async function ensureWebUser(
  request: APIRequestContext,
  opts: {
    email: string;
    password: string;
    role: "admin" | "user";
    displayName?: string;
  },
): Promise<void> {
  const res = await request.post(`${API_URL}/auth/dev/create-user`, {
    data: {
      email: opts.email,
      password: opts.password,
      display_name: opts.displayName ?? opts.email,
      role: opts.role,
    },
  });
  if (!res.ok() && res.status() !== 400) {
    throw new Error(`create-user failed: ${res.status()} ${await res.text()}`);
  }
}

export async function loginWebUser(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${API_URL}/auth/email`, {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`email login failed: ${res.status()} ${await res.text()}`);
  }
  const cookie = parseSessionCookie(res.headers()["set-cookie"]);
  if (!cookie) {
    throw new Error("email login did not return ea_session cookie");
  }
  return cookie;
}

export type SeedWebSessionOpts = {
  /** 自定义邮箱前缀（会再拼 worker 后缀做并行隔离） */
  emailPrefix?: string;
  password?: string;
  /** 显式 worker index；默认读 TEST_PARALLEL_INDEX */
  workerIndex?: number;
};

/**
 * 在 BrowserContext 注入 ea_session。
 * 邮箱始终含 worker 后缀，避免多 worker 共用 e2e-user-default。
 * 角色切换：调用方须先 clearWebSession 或 new context，再 seed 另一角色。
 */
export async function seedWebSession(
  context: BrowserContext,
  request: APIRequestContext,
  role: "admin" | "user",
  opts: SeedWebSessionOpts = {},
): Promise<{ email: string; password: string }> {
  const worker = parallelWorkerIndex(opts.workerIndex);
  const base = opts.emailPrefix ?? "default";
  const suffix = `${base}-w${worker}`;
  const email = `e2e-${role}-${suffix}@example.com`;
  const password = opts.password ?? "e2e-pass";
  await ensureWebUser(request, { email, password, role, displayName: `E2E ${role} ${suffix}` });
  const cookie = await loginWebUser(request, email, password);
  await context.addCookies([
    {
      name: "ea_session",
      value: cookie,
      url: WEB_URL,
    },
  ]);
  return { email, password };
}

/** 清除 web origin 上的 ea_session，供同 context 角色切换。 */
export async function clearWebSession(context: BrowserContext): Promise<void> {
  await context.clearCookies();
}

/**
 * 同 context 切换角色：先清 cookie 再 seed。
 * 页面侧 ops-role 模块缓存会在下次 navigation + /auth/me 刷新。
 */
export async function reseedsWebSessionAs(
  context: BrowserContext,
  request: APIRequestContext,
  role: "admin" | "user",
  opts: SeedWebSessionOpts = {},
): Promise<{ email: string; password: string }> {
  await clearWebSession(context);
  return seedWebSession(context, request, role, opts);
}

/**
 * 真实 Login UI 邮箱密码路径（durable 重登）。
 * 调用前须 ensureWebUser；会清掉 context cookie 以免短路。
 */
export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.context().clearCookies();
  await page.addInitScript(() => {
    localStorage.setItem("ea_lang", "en");
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Email" }).click();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
