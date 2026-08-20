import { afterEach, describe, expect, it } from "vitest";
import { defaultDataRoot, resetAgentDataRootCache, resolveAgentDataDir } from "./data-dir.js";

describe("resolveAgentDataDir", () => {
  afterEach(() => {
    delete process.env.AGENT_DATA_DIR;
    resetAgentDataRootCache();
  });

  it("prefers AGENT_DATA_DIR when set", () => {
    process.env.AGENT_DATA_DIR = "/tmp/agent-data-test";
    expect(resolveAgentDataDir()).toBe("/tmp/agent-data-test");
  });

  it("resolves relative AGENT_DATA_DIR from repo root when cwd is apps/api", () => {
    process.env.AGENT_DATA_DIR = ".agentstack/dev-profiles/test/data";
    const apiCwd = "/repo/apps/api";
    expect(resolveAgentDataDir(apiCwd)).toBe("/repo/.agentstack/dev-profiles/test/data");
  });

  it("uses repo-root default data when cwd is apps/api and AGENT_DATA_DIR unset", () => {
    const apiCwd = "/repo/apps/api";
    expect(resolveAgentDataDir(apiCwd)).toBe("/repo/.agentstack/dev-profiles/default/data");
  });

  it("falls back to defaultDataRoot", () => {
    expect(resolveAgentDataDir()).toBe(defaultDataRoot());
  });
});
