import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { seedDefaultUsers } from "../test/users-fixture.js";
import { dataRoot } from "../fs/deployment-path.js";

let testDir: string;

describe("ensurePrincipalUser", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("ensure-principal");
    seedDefaultUsers();
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("returns existing user without duplicating", async () => {
    const { ensurePrincipalUser } = await import("./ensure-principal.js");
    const row = ensurePrincipalUser("owner-001", "dep-gh-pilot-001");
    expect(row.user_id).toBe("owner-001");
    expect(row.role).toBe("owner");
  });

  it("auto-provisions arbitrary principal as owner", async () => {
    const { ensurePrincipalUser } = await import("./ensure-principal.js");
    const row = ensurePrincipalUser("own01", "dep-gh-pilot-001");
    expect(row.user_id).toBe("own01");
    expect(row.role).toBe("owner");
    expect(row.deployment_id).toBe("dep-gh-pilot-001");
    expect(existsSync(resolve(dataRoot(), "users.json"))).toBe(true);
  });
});
