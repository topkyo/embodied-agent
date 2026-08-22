import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { findRepoRootFrom } from "./catalog.js";

describe("domain pack catalog repoRoot", () => {
  it("finds domain-packs.json from dist-like nested path", () => {
    const root = join(tmpdir(), `ea-catalog-dist-${Date.now()}`);
    const nested = join(root, "apps/api/dist/domain-packs");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, "domain-packs.json"), JSON.stringify({ packs: [] }));
    expect(findRepoRootFrom(nested)).toBe(root);
    rmSync(root, { recursive: true, force: true });
  });

  it("finds domain-packs.json from tsx src-like nested path", () => {
    const root = join(tmpdir(), `ea-catalog-src-${Date.now()}`);
    const nested = join(root, "apps/api/src/domain-packs");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, "domain-packs.json"), JSON.stringify({ packs: [] }));
    expect(findRepoRootFrom(nested)).toBe(root);
    rmSync(root, { recursive: true, force: true });
  });

  it("throws when domain-packs.json cannot be found", () => {
    expect(() => findRepoRootFrom(tmpdir())).toThrow(/domain-packs\.json/);
  });

  it("resolves the live repository root", () => {
    const root = findRepoRootFrom(dirname(fileURLToPath(import.meta.url)));
    expect(existsSync(resolve(root, "domain-packs.json"))).toBe(true);
  });
});
