import { afterEach, describe, expect, it } from "vitest";
import { bindTestAgentRuntime } from "../../test/bind-test-runtime.js";
import { clearIntentLogs, getIntentLogs, recordIntentLog } from "./observability.js";

afterEach(() => {
  clearIntentLogs();
});

describe("observability buffer", () => {
  it("bounds in-memory buffer to the newest entries", () => {
    const bindings = bindTestAgentRuntime();
    for (let i = 0; i < 600; i++) {
      recordIntentLog(bindings, {
        intent_source: "llm",
        model: `m-${i}`,
        latency_ms: 1,
        raw_response: "",
        validated: true,
      });
    }
    const logs = getIntentLogs();
    expect(logs.length).toBe(500);
    expect(logs[0]?.model).toBe("m-100");
    expect(logs.at(-1)?.model).toBe("m-599");
  });
});
