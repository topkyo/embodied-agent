import type { APIRequestContext, Page } from "@playwright/test";

/** 微信扫码 E2E 必须走中文壳（英文模式渲染 WhatsApp 分支文案）。 */
export async function ensureZhLocale(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("ea_lang", "zh");
  });
}

export async function waitForApiHealthy(
  request: APIRequestContext,
  apiUrl: string,
  attempts = 10,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await request.get(`${apiUrl}/health`);
      if (res.ok()) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`API not healthy at ${apiUrl}`);
}

export async function fetchWechatBindings(
  request: APIRequestContext,
  apiUrl: string,
  adminToken = "dev-admin",
): Promise<Array<{ platform: string; platform_user_id: string; principal_user_id: string }>> {
  const res = await request.get(`${apiUrl}/admin/bindings`, {
    headers: { "x-admin-token": adminToken },
  });
  if (!res.ok()) {
    throw new Error(`GET /admin/bindings failed: ${res.status()}`);
  }
  const body = (await res.json()) as {
    bindings?: Array<{ platform: string; platform_user_id: string; principal_user_id: string }>;
  };
  return body.bindings ?? [];
}

/**
 * 用 session cookie 调 API（Playwright request 不自动带 browser cookie）。
 */
export async function apiWithSession(
  request: APIRequestContext,
  apiUrl: string,
  sessionCookie: string,
  method: "GET" | "POST",
  path: string,
  data?: unknown,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {
    cookie: `ea_session=${sessionCookie}`,
  };
  if (method === "POST") {
    headers["content-type"] = "application/json";
  }
  const res =
    method === "GET"
      ? await request.get(`${apiUrl}${path}`, { headers })
      : await request.post(`${apiUrl}${path}`, {
          headers,
          data,
        });
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
}
