import { beforeAll, describe, expect, it } from "vitest";
import {
  buildWechatRow,
  isPromotableToWechat,
  utteranceInMatrix,
} from "./promote-failure-cases-lib.js";
import type { AgentRuntimeContext, IntentFailureCase } from "@embodied-agent/agent";
import { bindScriptRuntime, getScriptAgentRuntimeContext } from "./bind-script-runtime.js";

let bindings: AgentRuntimeContext["bindings"];

beforeAll(async () => {
  await bindScriptRuntime();
  bindings = getScriptAgentRuntimeContext().bindings;
});

function baseCase(patch: Partial<IntentFailureCase>): IntentFailureCase {
  return {
    id: "f-test",
    utterance: "2号棚A区开启灌溉15分钟",
    raw_response: "",
    failure_kind: "skill_mismatch",
    confidence: "high",
    promoted: false,
    recorded_at: "2026-06-08T00:00:00.000Z",
    ...patch,
  };
}

describe("promote-failure-cases-lib", () => {
  it("R2: skill_mismatch with pro fix is promotable", () => {
    const row = baseCase({
      flash_skill: "greenhouse.open_vent",
      pro_intent: {
        skill: "irrigation.start",
        target: { greenhouse_id: "gh-002" },
        parameters: { duration_seconds: 900 },
      },
    });
    expect(isPromotableToWechat(bindings, row)).toBe(true);
    const draft = buildWechatRow(bindings, row);
    expect(draft?.expected_skill).toBe("irrigation.start");
    expect(draft?.expected?.parameters?.duration_seconds).toBe(900);
  });

  it("R1: user_correction is promotable", () => {
    const row = baseCase({
      utterance: "开启灌溉不是通风",
      failure_kind: "user_correction",
      history: [
        { role: "user", content: "2号棚A区开启灌溉15分钟" },
        { role: "assistant", content: "将执行通风" },
      ],
      pro_intent: {
        skill: "irrigation.start",
        target: { greenhouse_id: "gh-002" },
        parameters: { duration_seconds: 900 },
      },
    });
    expect(isPromotableToWechat(bindings, row)).toBe(true);
    expect(buildWechatRow(bindings, row)?.history).toHaveLength(2);
  });

  it("R3: verify_chat with expected is promotable", () => {
    const row = baseCase({
      utterance: "A区灌溉5分钟",
      failure_kind: "verify_chat",
      expected_skill: "irrigation.start",
      expected: {
        target: { zone_id: "zone-a" },
        parameters: { duration_seconds: 300 },
      },
    });
    expect(isPromotableToWechat(bindings, row)).toBe(true);
    const draft = buildWechatRow(bindings, row);
    expect(draft?.expected_skill).toBe("irrigation.start");
    expect(draft?.expected?.target?.zone_id).toBe("zone-a");
  });

  it("rejects low confidence", () => {
    expect(isPromotableToWechat(bindings, baseCase({ confidence: "low" }))).toBe(false);
  });

  it("rejects promoted rows", () => {
    expect(isPromotableToWechat(bindings, baseCase({ promoted: true }))).toBe(false);
  });

  it("in-run wechat list blocks second row with same utterance", () => {
    const wechat = [
      {
        utterance: "2号棚B区浇水8分钟",
        expected_skill: "irrigation.start",
      },
    ];
    expect(utteranceInMatrix("2号棚B区浇水8分钟", wechat)).toBe(true);
    wechat.push({
      utterance: "B区灌溉4分钟",
      expected_skill: "irrigation.start",
    });
    expect(utteranceInMatrix("B区灌溉4分钟", wechat)).toBe(true);
    expect(utteranceInMatrix("全新话术", wechat)).toBe(false);
  });

  it("rejects skill_mismatch when pro still conflicts", () => {
    const row = baseCase({
      utterance: "2号棚开通风15分钟",
      pro_intent: {
        skill: "irrigation.start",
        target: { greenhouse_id: "gh-002" },
        parameters: { duration_seconds: 900 },
      },
    });
    expect(isPromotableToWechat(bindings, row)).toBe(false);
  });
});
