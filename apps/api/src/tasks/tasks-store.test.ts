import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { createSceneTask, listSceneTasks } from "./tasks-store.js";

let testDir: string;

describe("scene tasks store", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("creates and lists pending tasks", () => {
    createSceneTask({
      deployment_id: "dep-gh-pilot-001",
      title: "明天打药",
      created_by: "owner-001",
      entity_id: "gh-001",
    });
    const tasks = listSceneTasks("dep-gh-pilot-001", "pending");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe("明天打药");
    expect(tasks[0]?.entity_id).toBe("gh-001");
  });
});
