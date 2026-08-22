import { describe, expect, it } from "vitest";
import {
  applyCorsHeaders,
  corsAllowHeaders,
  DEV_CORS_ALLOWLIST,
  isOriginAllowed,
  rejectAdminTokenFromDisallowedOrigin,
  resolveCorsAllowlist,
} from "./cors.js";

describe("cors allowlist", () => {
  it("uses empty allowlist in production when CORS_ORIGIN is unset", () => {
    expect(resolveCorsAllowlist(undefined, true)).toEqual([]);
  });

  it("uses localhost allowlist in explicit development when CORS_ORIGIN is unset", () => {
    expect(resolveCorsAllowlist(undefined, false)).toEqual(DEV_CORS_ALLOWLIST);
  });

  it("maps wildcard to localhost allowlist in non-production", () => {
    expect(resolveCorsAllowlist("*", false)).toEqual(DEV_CORS_ALLOWLIST);
  });

  it("rejects wildcard in production", () => {
    expect(() => resolveCorsAllowlist("*", true)).toThrow(/must not be '\*'/);
  });

  it("parses comma-separated allowlist", () => {
    expect(resolveCorsAllowlist("https://a.example, https://b.example", true)).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });

  it("includes x-admin-token only for allowlisted origins", () => {
    expect(corsAllowHeaders(false)).toBe("Content-Type, Authorization");
    expect(corsAllowHeaders(true)).toContain("x-admin-token");
  });

  it("reflects allowlisted origin and omits admin header for unknown origin", () => {
    const headers: Record<string, string> = {};
    applyCorsHeaders(
      { headers: { origin: "https://evil.example" } },
      {
        header(name, value) {
          headers[name] = value;
        },
      },
      ["http://localhost:5173"],
    );
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(headers["Access-Control-Allow-Headers"]).toBe("Content-Type, Authorization");
  });

  it("reflects allowlisted origin and exposes x-admin-token", () => {
    const headers: Record<string, string> = {};
    applyCorsHeaders(
      { headers: { origin: "http://localhost:5173" } },
      {
        header(name, value) {
          headers[name] = value;
        },
      },
      DEV_CORS_ALLOWLIST,
    );
    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
    expect(headers["Access-Control-Allow-Headers"]).toContain("x-admin-token");
    expect(isOriginAllowed(DEV_CORS_ALLOWLIST, "http://localhost:5173")).toBe(true);
  });

  it("sets Vary: Origin for cache correctness with dynamic allow-origin", () => {
    const headers: Record<string, string> = {};
    applyCorsHeaders(
      { headers: { origin: "http://localhost:5173" } },
      {
        header(name, value) {
          headers[name] = value;
        },
      },
      DEV_CORS_ALLOWLIST,
    );
    expect(headers["Vary"]).toBe("Origin");
  });

  it("rejects x-admin-token requests from disallowed origins, allows no-origin clients", () => {
    const disallowed = { origin: "https://evil.example", originAllowed: false };
    expect(
      rejectAdminTokenFromDisallowedOrigin(
        { headers: { origin: "https://evil.example", "x-admin-token": "t" } },
        disallowed,
      ),
    ).toBe(true);
    expect(
      rejectAdminTokenFromDisallowedOrigin(
        { headers: { origin: "https://evil.example" } },
        disallowed,
      ),
    ).toBe(false);
    expect(
      rejectAdminTokenFromDisallowedOrigin(
        { headers: { "x-admin-token": "t" } },
        { origin: undefined, originAllowed: false },
      ),
    ).toBe(false);
    expect(
      rejectAdminTokenFromDisallowedOrigin(
        { headers: { origin: "http://localhost:5173", "x-admin-token": "t" } },
        { origin: "http://localhost:5173", originAllowed: true },
      ),
    ).toBe(false);
  });
});
