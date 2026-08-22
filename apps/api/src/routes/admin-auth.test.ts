import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireAdmin, requireOperator, getAdminActor } from "./admin-auth.js";
import { isExplicitDevEnv } from "../runtime/env-mode.js";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import { saveSettings } from "../settings/store.js";
import { addAdminToken } from "../settings/admin-tokens.js";

function restoreNodeEnv(saved: string | undefined): void {
  if (saved === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = saved;
  }
}

describe("isExplicitDevEnv", () => {
  const savedNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    restoreNodeEnv(savedNodeEnv);
  });

  it("returns true only for explicit development/test", () => {
    process.env.NODE_ENV = "development";
    expect(isExplicitDevEnv()).toBe(true);
    process.env.NODE_ENV = "test";
    expect(isExplicitDevEnv()).toBe(true);
  });

  it("returns false for unset, empty, production, and other values", () => {
    delete process.env.NODE_ENV;
    expect(isExplicitDevEnv()).toBe(false);
    process.env.NODE_ENV = "";
    expect(isExplicitDevEnv()).toBe(false);
    process.env.NODE_ENV = "production";
    expect(isExplicitDevEnv()).toBe(false);
    process.env.NODE_ENV = "staging";
    expect(isExplicitDevEnv()).toBe(false);
  });
});

describe("requireAdmin", () => {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedAdminToken = process.env.ADMIN_TOKEN;
  let testDir: string;

  beforeEach(() => {
    delete process.env.ADMIN_TOKEN;
    testDir = allocateAgentDataDir("admin-auth");
    seedCanonicalSimRegistry();
    saveSettings({ deployment_id: "dep-gh-pilot-001", active_domain: "agriculture" });
  });

  afterEach(() => {
    restoreNodeEnv(savedNodeEnv);
    if (savedAdminToken === undefined) {
      delete process.env.ADMIN_TOKEN;
    } else {
      process.env.ADMIN_TOKEN = savedAdminToken;
    }
    releaseAgentDataDir(testDir);
  });

  it("rejects dev-admin fallback when NODE_ENV is unset and no ADMIN_TOKEN", () => {
    delete process.env.NODE_ENV;
    expect(requireAdmin({ headers: { "x-admin-token": "dev-admin" } })).toBe(false);
  });

  it("allows dev-admin fallback under explicit NODE_ENV=development", () => {
    process.env.NODE_ENV = "development";
    const request = { headers: { "x-admin-token": "dev-admin" } };
    expect(requireAdmin(request)).toBe(true);
    expect(getAdminActor(request)).toBe("dev-admin");
  });

  it("allows explicit matching ADMIN_TOKEN when NODE_ENV is unset", () => {
    delete process.env.NODE_ENV;
    process.env.ADMIN_TOKEN = "explicit-admin-token";
    const okRequest = { headers: { "x-admin-token": "explicit-admin-token" } };
    expect(requireAdmin(okRequest)).toBe(true);
    expect(getAdminActor(okRequest)).toBe("env:ADMIN_TOKEN");
    expect(requireAdmin({ headers: { "x-admin-token": "dev-admin" } })).toBe(false);
  });

  it("allows settings admin_tokens and sets actor name", () => {
    addAdminToken("installer", "installer-token-value");
    const request = { headers: { "x-admin-token": "installer-token-value" } };
    expect(requireAdmin(request)).toBe(true);
    expect(getAdminActor(request)).toBe("installer");
  });

  it("allows admin web session without x-admin-token", () => {
    const request = {
      headers: {},
      webSession: {
        session_id: "sess-1",
        user_id: "admin",
        role: "admin" as const,
        display_name: "Admin",
        created_at: Date.now(),
        expires_at: Date.now() + 60_000,
      },
    };
    expect(requireAdmin(request)).toBe(true);
    expect(getAdminActor(request)).toBe("web:admin");
  });

  it("rejects user web session for admin endpoints", () => {
    const request = {
      headers: {},
      webSession: {
        session_id: "sess-2",
        user_id: "user-1",
        role: "user" as const,
        display_name: "User",
        created_at: Date.now(),
        expires_at: Date.now() + 60_000,
      },
    };
    expect(requireAdmin(request)).toBe(false);
  });
});

describe("requireOperator", () => {
  it("allows any web session including user role", () => {
    const request = {
      headers: {},
      webSession: {
        session_id: "sess-3",
        user_id: "user-1",
        role: "user" as const,
        display_name: "User",
        created_at: Date.now(),
        expires_at: Date.now() + 60_000,
      },
    };
    expect(requireOperator(request)).toBe(true);
    expect(getAdminActor(request)).toBe("web:user-1");
  });

  it("rejects unauthenticated request", () => {
    expect(requireOperator({ headers: {} })).toBe(false);
  });
});
