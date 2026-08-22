import { vi, type MockInstance } from "vitest";
import {
  domainPacksFixture,
  publicDomainPacksFixture,
  settingsFixture,
  type CatalogEntry,
} from "./fixtures";

export function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

export function getFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export type FetchRouteHandler = (
  url: string,
  init?: RequestInit,
) => Promise<Response> | Response | null | undefined;

export type MockFetchOptions = {
  activeDomain?: string;
  deploymentId?: string;
  catalog?: CatalogEntry[];
  activeOpsSchema?: unknown;
  /** /auth/me body; null → 401 */
  authMe?: { user_id: string; role: "admin" | "user"; display_name: string } | null;
  routes?: FetchRouteHandler[];
  /** 未匹配路由：throw（默认）| 500 */
  unmatched?: "throw" | "500";
};

function toFetchResponse(hit: Response | Promise<Response>): Promise<Response> {
  return Promise.resolve(hit);
}

/**
 * 默认覆盖 /auth/me、公开 /domain-packs、admin settings/domain-packs。
 * 未匹配路由默认 throw，禁止隐式 {} 成功兜底。
 */
export function mockAppFetch(opts: MockFetchOptions = {}): MockInstance<typeof globalThis.fetch> {
  const routes = opts.routes ?? [];
  const unmatched = opts.unmatched ?? "throw";
  const authMe =
    opts.authMe === undefined
      ? { user_id: "u-test", role: "user" as const, display_name: "Test" }
      : opts.authMe;

  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = getFetchUrl(input);

    for (const route of routes) {
      const hit = route(url, init);
      if (hit != null) return toFetchResponse(hit);
    }

    if (url.includes("/auth/me")) {
      if (authMe === null) {
        return jsonResponse({ error: "unauthorized" }, 401);
      }
      return jsonResponse(authMe);
    }

    if (url.includes("/domain-packs") && !url.includes("/admin/")) {
      return jsonResponse(
        publicDomainPacksFixture({
          activeDomain: opts.activeDomain,
          catalog: opts.catalog,
        }),
      );
    }

    if (url.includes("/admin/domain-packs")) {
      return jsonResponse(
        domainPacksFixture({
          activeDomain: opts.activeDomain,
          deploymentId: opts.deploymentId,
          catalog: opts.catalog,
          activeOpsSchema: opts.activeOpsSchema,
        }),
      );
    }

    if (url.includes("/admin/settings")) {
      if (authMe?.role !== "admin") {
        return jsonResponse({ error: "unauthorized" }, 401);
      }
      return jsonResponse(
        settingsFixture({
          activeDomain: opts.activeDomain,
          deploymentId: opts.deploymentId,
        }),
      );
    }

    if (unmatched === "500") {
      return jsonResponse({ error: `unmocked fetch: ${url}` }, 500);
    }
    throw new Error(`unexpected fetch (register explicitly): ${url}`);
  });
}
