import { allocateAgentDataDir, releaseAgentDataDir } from "@embodied-agent/platform";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { bindTestAgentRuntime } from "../../test/bind-test-runtime.js";
import type { AgentRuntimeBindings, AgentSettingsSlice } from "../runtime-bindings.js";

let testDir: string;
let bindings: AgentRuntimeBindings;

function writeSettings(extra: Record<string, unknown>): void {
  writeFileSync(
    resolve(testDir, "settings.json"),
    JSON.stringify({
      deployment_id: "dep-gh-pilot-001",
      llm_provider: "deepseek",
      llm_api_key: "sk-llm",
      llm_base_url: "https://api.deepseek.com/v1",
      llm_model: "deepseek-v4-flash",
      stt_model: "whisper-1",
      ...extra,
    }),
  );
  bindings = bindTestAgentRuntime({
    getEffectiveSettings: () =>
      JSON.parse(readFileSync(resolve(testDir, "settings.json"), "utf8")) as AgentSettingsSlice,
  });
}

describe("resolveUtteranceText", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    releaseAgentDataDir(testDir);
  });

  it("returns text when no audio", async () => {
    writeSettings({ stt_provider: "none" });
    const { resolveUtteranceText } = await import("./stt.js");
    const r = await resolveUtteranceText(bindings, { text: "1号棚多少度" });
    expect(r).toEqual({ text: "1号棚多少度", from_stt: false });
  });

  it("transcribes audio via OpenAI Whisper", async () => {
    writeSettings({
      stt_provider: "openai_whisper",
      llm_provider: "openai",
      llm_api_key: "sk-test",
      llm_base_url: "https://api.openai.com/v1",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ text: "打开1号棚侧帘" }),
      })),
    );
    const { resolveUtteranceText } = await import("./stt.js");
    const r = await resolveUtteranceText(bindings, {
      audio_base64: Buffer.from("fake-audio").toString("base64"),
      audio_format: "wav",
    });
    expect(r.from_stt).toBe(true);
    expect(r.text).toBe("打开1号棚侧帘");
  });

  it("transcribes audio via Aliyun NLS", async () => {
    writeSettings({
      stt_provider: "aliyun",
      stt_app_key: "nls-app",
      stt_api_key: "nls-token",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () => JSON.stringify({ result: "1号棚温度多少" }),
      })),
    );
    const { resolveUtteranceText } = await import("./stt.js");
    const r = await resolveUtteranceText(bindings, {
      audio_base64: Buffer.from("pcm").toString("base64"),
      audio_format: "wav",
    });
    expect(r.text).toBe("1号棚温度多少");
  });

  it("fails when stt not configured but audio sent", async () => {
    writeSettings({ stt_provider: "none" });
    const { resolveUtteranceText } = await import("./stt.js");
    const { SttUnavailableError } = await import("./stt-errors.js");
    await expect(
      resolveUtteranceText(bindings, {
        audio_base64: Buffer.from("x").toString("base64"),
      }),
    ).rejects.toBeInstanceOf(SttUnavailableError);
  });
});
