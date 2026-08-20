import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canAccessPlatformBase,
  canShowAdminNav,
  clearOpsRole,
  getAuthUser,
  getOpsRole,
  isAdminOps,
  refreshOpsRole,
  setOpsRoleFromAuth,
} from "./ops-role";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  clearOpsRole();
});

afterEach(() => {
  clearOpsRole();
  vi.unstubAllGlobals();
});

describe("ops-role", () => {
  it("defaults to unauthenticated", () => {
    expect(getOpsRole()).toBeNull();
    expect(isAdminOps()).toBe(false);
    expect(canAccessPlatformBase()).toBe(false);
    expect(canShowAdminNav()).toBe(false);
  });

  it("maps admin session to admin nav semantics", () => {
    setOpsRoleFromAuth({
      user_id: "admin",
      role: "admin",
      display_name: "Admin",
    });
    expect(getOpsRole()).toBe("admin");
    expect(isAdminOps()).toBe(true);
    expect(canAccessPlatformBase()).toBe(true);
    expect(canShowAdminNav()).toBe(true);
  });

  it("does not grant admin nav for user session", () => {
    setOpsRoleFromAuth({
      user_id: "user-1",
      role: "user",
      display_name: "User",
    });
    expect(getOpsRole()).toBe("user");
    expect(isAdminOps()).toBe(false);
    expect(canAccessPlatformBase()).toBe(false);
    expect(canShowAdminNav()).toBe(false);
  });

  it("stale anonymous /auth/me does not wipe session set at login", async () => {
    let resolveMe: (value: Response) => void = () => {};
    const meDeferred = new Promise<Response>((resolve) => {
      resolveMe = resolve;
    });
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/auth/me")) {
        return meDeferred;
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    const pending = refreshOpsRole();
    setOpsRoleFromAuth({
      user_id: "u-admin",
      role: "admin",
      display_name: "Admin",
    });

    resolveMe(
      new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await pending;

    expect(getAuthUser()?.user_id).toBe("u-admin");
  });

  it("stale /auth/me 200 after clearOpsRole does not restore session", async () => {
    let resolveMe: (value: Response) => void = () => {};
    const meDeferred = new Promise<Response>((resolve) => {
      resolveMe = resolve;
    });
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/auth/me")) {
        return meDeferred;
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    const pending = refreshOpsRole();
    clearOpsRole();

    resolveMe(
      new Response(
        JSON.stringify({ user_id: "u-stale", role: "admin", display_name: "Stale" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await pending;

    expect(getAuthUser()).toBeNull();
  });
});
