import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebAccount, listWebAccounts, setWebAccountPassword } from "./auth";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("listWebAccounts", () => {
  it("GETs /auth/accounts with credentials and returns accounts", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          accounts: [
            {
              user_id: "u-admin",
              role: "admin",
              display_name: "Admin",
              email: "admin@example.com",
              created_at: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const data = await listWebAccounts();

    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/accounts",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(data.accounts).toHaveLength(1);
    expect(data.accounts[0]).toMatchObject({
      user_id: "u-admin",
      role: "admin",
      email: "admin@example.com",
    });
  });

  it("throws with server error message on non-OK", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(listWebAccounts()).rejects.toThrow("unauthorized");
  });
});

describe("createWebAccount", () => {
  it("POSTs JSON body to /auth/account/create", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          user_id: "u-new",
          role: "user",
          display_name: "New User",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const me = await createWebAccount({
      email: "new@example.com",
      password: "password1",
      display_name: "New User",
      role: "user",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/account/create",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          email: "new@example.com",
          password: "password1",
          display_name: "New User",
          role: "user",
        }),
      }),
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(me).toMatchObject({ user_id: "u-new", role: "user" });
  });
});

describe("setWebAccountPassword", () => {
  it("POSTs user_id and password; omits empty email", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await setWebAccountPassword("u-1", "newpass12");

    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/account/password",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ user_id: "u-1", password: "newpass12" }),
      }),
    );
    expect(res).toEqual({ ok: true });
  });

  it("includes trimmed email when provided for accounts without email", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await setWebAccountPassword("u-2", "newpass12", "  bind@example.com  ");

    expect(fetchMock).toHaveBeenCalledWith(
      "/auth/account/password",
      expect.objectContaining({
        body: JSON.stringify({
          user_id: "u-2",
          password: "newpass12",
          email: "bind@example.com",
        }),
      }),
    );
  });
});
