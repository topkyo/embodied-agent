import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteUser, listUsers, loadUsersMap, upsertUser } from "./user-store.js";
import { getUserStrict, invalidateUsersCache } from "./users.js";
import { seedDefaultUsers } from "../test/users-fixture.js";

let testDir: string;

describe("user-store", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    invalidateUsersCache();
  });
  afterEach(() => {
    invalidateUsersCache();
    releaseAgentDataDir(testDir);
  });

  it("fails visibly when users.json is missing", () => {
    expect(() => loadUsersMap()).toThrow(/users\.json.*不存在/);
    expect(existsSync(resolve(testDir, "users.json"))).toBe(false);
  });

  it("upsert and delete users with owner guard", async () => {
    seedDefaultUsers();
    await upsertUser({
      user_id: "operator-002",
      role: "operator",
      deployment_id: "dep-gh-pilot-001",
      display_name: "王操作员",
    });
    expect(getUserStrict("operator-002")?.display_name).toBe("王操作员");

    await deleteUser("operator-002");
    invalidateUsersCache();
    expect(getUserStrict("operator-002")).toBeUndefined();
  });

  it("rejects deleting the last owner", async () => {
    seedDefaultUsers();
    const owners = listUsers().filter((u) => u.role === "owner");
    await expect(deleteUser(owners[0]!.user_id)).rejects.toThrow(/最后一个 owner/);
  });
});
