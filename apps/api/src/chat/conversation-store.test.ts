import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  appendConversationTurns,
  clearAllConversationSessions,
  getConversationHistory,
  getConversationHistoryForLlm,
} from "./conversation-store.js";

let testDir: string;

describe("conversation-store", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    clearAllConversationSessions();
  });
  afterEach(() => {
    clearAllConversationSessions();
    delete process.env.CONVERSATION_MAX_TURNS;
    releaseAgentDataDir(testDir);
  });

  it("returns empty history for new session", () => {
    expect(getConversationHistory("u1", "c1")).toEqual([]);
  });

  it("appends and retrieves turns", () => {
    appendConversationTurns("u1", "c1", [
      { role: "user", content: "1号棚多少度" },
      { role: "assistant", content: "31°C" },
    ]);
    const hist = getConversationHistoryForLlm("u1", "c1");
    expect(hist).toEqual([
      { role: "user", content: "1号棚多少度" },
      { role: "assistant", content: "31°C" },
    ]);
  });

  it("trims to CONVERSATION_MAX_TURNS", () => {
    process.env.CONVERSATION_MAX_TURNS = "2";
    clearAllConversationSessions();
    appendConversationTurns("u1", "c1", [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
      { role: "assistant", content: "d" },
    ]);
    expect(getConversationHistory("u1", "c1")).toHaveLength(2);
    expect(getConversationHistory("u1", "c1")[0].content).toBe("c");
  });
});
