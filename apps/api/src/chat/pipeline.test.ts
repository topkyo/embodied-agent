import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { afterEach, describe, expect, it, beforeEach } from "vitest";
import { processChatMessage } from "./pipeline.js";
import { clearAllConversationSessions } from "./conversation-store.js";
import { clearAllPendingConfirm, setPendingConfirm } from "../policy/pending-confirm.js";
import { DEFAULT_DEPLOYMENT_CONTEXT } from "../fixtures/demo-telemetry.js";
import type { LlmClient } from "@embodied-agent/agent";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import { seedDefaultUsers } from "../test/users-fixture.js";
import { ingestHeartbeatMessage } from "../telemetry/store.js";

let pipelineTestDir: string;

const llmMustNotRun: LlmClient = {
  async completeJson() {
    throw new Error("理解层单测不注入 LLM；请用 npm run sim:matrix / verify:chat");
  },
  async completeText() {
    throw new Error("理解层单测不注入 LLM；请用 npm run sim:matrix / verify:chat");
  },
};

describe("processChatMessage (非理解层)", () => {
  beforeEach(() => {
    pipelineTestDir = allocateAgentDataDir("pipeline");
    seedCanonicalSimRegistry();
    seedDefaultUsers();
    ingestHeartbeatMessage({ node_id: "node-sim-gh-001", config_version: 1 });
    clearAllConversationSessions();
    clearAllPendingConfirm();
  });

  afterEach(() => {
    releaseAgentDataDir(pipelineTestDir);
  });

  it("confirms pending via getPendingConfirmForUser when conversation_id differs", async () => {
    setPendingConfirm({
      intent: {
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
        parameters: { duration_seconds: 600 },
        confidence: 0.9,
      },
      user_id: "owner-001",
      conversation_id: "wx-openid-abc",
      model: "live",
    });

    const result = await processChatMessage(
      {
        platform: "wechat",
        user_id: "owner-001",
        conversation_id: "lobster-other-id",
        text: "确认",
        timestamp: new Date().toISOString(),
      },
      {
        llmClient: llmMustNotRun,
        model: "live",
        deploymentContext: DEFAULT_DEPLOYMENT_CONTEXT,
        mqttEnabled: false,
      },
    );

    expect(result.status).toBe(503);
    expect(result.reply).toContain("设备链路不可用");
  });

  it("refuses ambiguous confirm when multiple pending scenes share conversation", async () => {
    setPendingConfirm({
      intent: {
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
        parameters: { duration_seconds: 600 },
        confidence: 0.9,
      },
      user_id: "owner-001",
      conversation_id: "wx-openid",
      model: "live",
      scene_skill_id: "humidity_mildew_prevention",
    });
    setPendingConfirm({
      intent: {
        skill: "greenhouse.set_mode",
        target: { greenhouse_id: "gh-002" },
        parameters: { mode: "night_vent", max_temp_c: 32 },
        confidence: 0.9,
      },
      user_id: "owner-001",
      conversation_id: "wx-openid",
      model: "live",
      scene_skill_id: "night_ventilation_control",
    });

    const result = await processChatMessage(
      {
        platform: "wechat",
        user_id: "owner-001",
        conversation_id: "wx-openid",
        text: "确认",
        timestamp: new Date().toISOString(),
      },
      {
        llmClient: llmMustNotRun,
        model: "live",
        deploymentContext: DEFAULT_DEPLOYMENT_CONTEXT,
        mqttEnabled: false,
      },
    );

    expect(result.status).toBe(200);
    expect(result.reply).toContain("多个待确认");
  });

  it("refuses ambiguous correction when multiple pending scenes share conversation", async () => {
    setPendingConfirm({
      intent: {
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
        parameters: { duration_seconds: 600 },
        confidence: 0.9,
      },
      user_id: "owner-001",
      conversation_id: "wx-openid",
      model: "live",
      scene_skill_id: "humidity_mildew_prevention",
    });
    setPendingConfirm({
      intent: {
        skill: "greenhouse.set_mode",
        target: { greenhouse_id: "gh-002" },
        parameters: { mode: "night_vent", max_temp_c: 32 },
        confidence: 0.9,
      },
      user_id: "owner-001",
      conversation_id: "wx-openid",
      model: "live",
      scene_skill_id: "night_ventilation_control",
    });

    const result = await processChatMessage(
      {
        platform: "wechat",
        user_id: "owner-001",
        conversation_id: "wx-openid",
        text: "开启灌溉不是通风",
        timestamp: new Date().toISOString(),
      },
      {
        llmClient: llmMustNotRun,
        model: "live",
        deploymentContext: DEFAULT_DEPLOYMENT_CONTEXT,
        mqttEnabled: false,
      },
    );

    expect(result.status).toBe(200);
    expect(result.reply).toContain("多个待确认");
  });

  it("refuses ambiguous confirm when multiple pending scenes exist across conversations", async () => {
    setPendingConfirm({
      intent: {
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
        parameters: { duration_seconds: 600 },
        confidence: 0.9,
      },
      user_id: "owner-001",
      conversation_id: "wx-openid",
      model: "live",
      scene_skill_id: "humidity_mildew_prevention",
    });
    setPendingConfirm({
      intent: {
        skill: "greenhouse.set_mode",
        target: { greenhouse_id: "gh-002" },
        parameters: { mode: "night_vent", max_temp_c: 32 },
        confidence: 0.9,
      },
      user_id: "owner-001",
      conversation_id: "wx-openid-2",
      model: "live",
      scene_skill_id: "night_ventilation_control",
    });

    const result = await processChatMessage(
      {
        platform: "wechat",
        user_id: "owner-001",
        conversation_id: "lobster-other-id",
        text: "确认",
        timestamp: new Date().toISOString(),
      },
      {
        llmClient: llmMustNotRun,
        model: "live",
        deploymentContext: DEFAULT_DEPLOYMENT_CONTEXT,
        mqttEnabled: false,
      },
    );

    expect(result.status).toBe(200);
    expect(result.reply).toContain("多个待确认");
  });

  it("refuses ambiguous correction when multiple pending scenes exist across conversations", async () => {
    setPendingConfirm({
      intent: {
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
        parameters: { duration_seconds: 600 },
        confidence: 0.9,
      },
      user_id: "owner-001",
      conversation_id: "wx-openid",
      model: "live",
      scene_skill_id: "humidity_mildew_prevention",
    });
    setPendingConfirm({
      intent: {
        skill: "greenhouse.set_mode",
        target: { greenhouse_id: "gh-002" },
        parameters: { mode: "night_vent", max_temp_c: 32 },
        confidence: 0.9,
      },
      user_id: "owner-001",
      conversation_id: "wx-openid-2",
      model: "live",
      scene_skill_id: "night_ventilation_control",
    });

    const result = await processChatMessage(
      {
        platform: "wechat",
        user_id: "owner-001",
        conversation_id: "lobster-other-id",
        text: "开启灌溉不是通风",
        timestamp: new Date().toISOString(),
      },
      {
        llmClient: llmMustNotRun,
        model: "live",
        deploymentContext: DEFAULT_DEPLOYMENT_CONTEXT,
        mqttEnabled: false,
      },
    );

    expect(result.status).toBe(200);
    expect(result.reply).toContain("多个待确认");
  });
});
