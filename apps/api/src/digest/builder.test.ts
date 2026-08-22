import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { buildDigestMessage } from "./builder.js";
import { appendOperationLog } from "../db/log.js";
import { resetTelemetryCacheForTests, upsertTelemetry } from "../telemetry/store.js";

let testDir: string;

describe("digest builder", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("digest-builder");
    resetTelemetryCacheForTests("dep-gh-pilot-001");
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("includes telemetry and operation summary", () => {
    upsertTelemetry(
      [
        {
          entity_id: "gh-001",
          temperature_c: 26,
          humidity_percent: 72,
          vent_status: "closed",
          fan_status: "off",
        },
      ],
      "dep-gh-pilot-001",
    );
    appendOperationLog({
      user_id: "owner-001",
      skill: "greenhouse.open_vent",
      intent_source: "llm",
      model: "test",
      params: { entity_id: "gh-001" },
      result: "completed",
      message: "ok",
    });
    const msg = buildDigestMessage("morning", "示例现场", "dep-gh-pilot-001");
    expect(msg).toContain("【晨间简报】");
    expect(msg).toContain("gh-001");
    expect(msg).toContain("今日操作");
  });
});
