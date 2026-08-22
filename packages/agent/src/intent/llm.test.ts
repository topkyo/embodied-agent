import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  resolveIntent,
  LlmUnavailableError,
  createFetchLlmClient,
  evaluateProEscalation,
  extractLastJsonObject,
  isFlashTierModel,
  type LlmClient,
} from "./llm.js";
import { clearIntentLogs, getIntentLogs } from "./observability.js";
import { loadIntentFailures } from "./failure-store.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { bindTestAgentRuntime } from "../../test/bind-test-runtime.js";
import type { AgentRuntimeBindings } from "../runtime-bindings.js";

let bindings: AgentRuntimeBindings;

const deploymentCtx = {
  deployment_id: "dep-gh-pilot-001",
  scene_context_sections: ["温室 ID 对照：\n- gh-001: 1号棚、一号棚、1棚\n- gh-002: 2号棚、二号棚"],
};

/** 仅用于编排层单测（repair / unavailable），不测用户话术理解；理解层见 sim:matrix / eval:intent */
function stubLlmClient(
  responder: (system: string, user: string, call: number) => string,
): LlmClient {
  let calls = 0;
  return {
    async completeJson(system, user) {
      calls += 1;
      return responder(system, user, calls);
    },
    async completeText(system, user) {
      calls += 1;
      return responder(system, user, calls);
    },
  };
}

beforeEach(() => {
  bindings = bindTestAgentRuntime();
});

describe("extractLastJsonObject", () => {
  it("keeps the last valid JSON object when an earlier object is longer", () => {
    const text =
      '修正前：{"skill":"greenhouse.open_vent","target":{"greenhouse_id":"gh-001"},"parameters":{"duration_seconds":7200},"confidence":0.9} 最终：{"skill":"greenhouse.set_mode","target":{"greenhouse_id":"gh-001"},"parameters":{"mode":"night_vent"}}';
    const picked = extractLastJsonObject(text);
    expect(picked).toBe(
      '{"skill":"greenhouse.set_mode","target":{"greenhouse_id":"gh-001"},"parameters":{"mode":"night_vent"}}',
    );
    expect(JSON.parse(picked!).skill).toBe("greenhouse.set_mode");
  });
});

describe("resolveIntent orchestration", () => {
  beforeEach(() => {
    clearIntentLogs();
  });

  it("logs accumulated token usage across JSON repair calls", async () => {
    const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    let calls = 0;
    const client: LlmClient = {
      async completeJson() {
        calls += 1;
        usage.prompt_tokens += 100;
        usage.completion_tokens += 10;
        usage.total_tokens += 110;
        if (calls === 1) return "not-json";
        return JSON.stringify({
          skill: "alert.set_threshold",
          target: { greenhouse_id: "gh-001" },
          parameters: { metric: "temperature_c", operator: ">", value: 30 },
        });
      },
      async completeText() {
        return "";
      },
      lastUsage() {
        return { ...usage };
      },
      resetUsage() {
        calls = 0;
        usage.prompt_tokens = 0;
        usage.completion_tokens = 0;
        usage.total_tokens = 0;
      },
    };
    const result = await resolveIntent(
      bindings,
      "1号棚温度超过30度报警",
      deploymentCtx,
      client,
      "stub",
    );
    expect(result.ok).toBe(true);
    const logged = getIntentLogs().find((row) => row.error === "invalid_json_repair_ok");
    expect(logged?.prompt_tokens).toBe(200);
    expect(logged?.completion_tokens).toBe(20);
    expect(logged?.total_tokens).toBe(220);
  });

  it("schema repair retries once when first JSON fails Zod", async () => {
    const client = stubLlmClient((_system, user) => {
      if (user.includes("未通过校验")) {
        return JSON.stringify({
          skill: "alert.set_threshold",
          target: { greenhouse_id: "gh-002" },
          parameters: {
            metric: "temperature_c",
            operator: ">",
            value: 30,
          },
        });
      }
      return JSON.stringify({
        skill: "alert.set_threshold",
        target: { greenhouse_id: "gh-002" },
        parameters: {},
      });
    });
    const result = await resolveIntent(
      bindings,
      "2号棚温度超过30度报警",
      deploymentCtx,
      client,
      "stub",
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.validation.kind === "intent") {
      expect(result.validation.intent.skill).toBe("alert.set_threshold");
    }
  });

  it("lets structural override reject a domain-invalid valid LLM intent", async () => {
    const client = stubLlmClient(() =>
      JSON.stringify({
        skill: "greenhouse.query_status",
        target: { greenhouse_id: "gh-001" },
        parameters: {},
      }),
    );
    const result = await resolveIntent(bindings, "三号棚多少度", deploymentCtx, client, "stub");
    expect(result.ok).toBe(true);
    if (result.ok && result.validation.kind === "intent") {
      expect(result.validation.intent.skill).toBe("clarification_needed");
      expect(result.validation.intent.target).toEqual({});
    }
  });

  it("uses structural override when LLM returns clarification", async () => {
    const client = stubLlmClient(() =>
      JSON.stringify({
        skill: "clarification_needed",
        clarification: "请确认要执行的动作。",
      }),
    );
    const result = await resolveIntent(bindings, "A区灌溉5分钟", deploymentCtx, client, "stub");
    expect(result.ok).toBe(true);
    if (result.ok && result.validation.kind === "intent") {
      expect(result.validation.intent.skill).toBe("irrigation.start");
      expect(result.validation.intent.target).toMatchObject({ zone_id: "zone-a" });
      expect(result.validation.intent.parameters).toMatchObject({ duration_seconds: 300 });
    }
  });

  it("does not record failure for long vent duration intent", async () => {
    const testDir = mkdtempSync(resolve(tmpdir(), "intent-policy-"));
    process.env.AGENT_DATA_DIR = testDir;
    process.env.NODE_ENV = "development";
    const client = stubLlmClient(() =>
      JSON.stringify({
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
        parameters: { duration_seconds: 7200 },
      }),
    );
    const result = await resolveIntent(bindings, "开一天", deploymentCtx, client, "stub");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.validation.kind).toBe("intent");
    expect(loadIntentFailures(bindings)).toHaveLength(0);
    process.env.NODE_ENV = "test";
    rmSync(testDir, { recursive: true, force: true });
  });

  it("extracts JSON embedded in prose and repairs invalid_json once", async () => {
    let calls = 0;
    const client = stubLlmClient(() => {
      calls += 1;
      if (calls === 1) {
        return '分析用户意图… 输出 JSON。{"skill":"greenhouse.open_vent","target":{"greenhouse_id":"gh-001"},"parameters":{"duration_seconds":600}}';
      }
      return JSON.stringify({
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
        parameters: { duration_seconds: 600 },
      });
    });
    const result = await resolveIntent(
      bindings,
      "1号棚侧帘开10分钟",
      deploymentCtx,
      client,
      "stub",
    );
    expect(result.ok).toBe(true);
    if (result.ok && result.validation.kind === "intent") {
      expect(result.validation.intent.skill).toBe("greenhouse.open_vent");
    }
    expect(calls).toBe(1);
  });

  it("returns unavailable when client throws", async () => {
    const client: LlmClient = {
      async completeJson() {
        throw new LlmUnavailableError();
      },
      async completeText() {
        throw new LlmUnavailableError();
      },
    };
    const result = await resolveIntent(bindings, "test", deploymentCtx, client, "stub");
    expect(result.ok).toBe(false);
  });
});

describe("createFetchLlmClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("throws without API key", () => {
    const prev = process.env.LLM_API_KEY;
    delete process.env.LLM_API_KEY;
    expect(() => createFetchLlmClient()).toThrow(LlmUnavailableError);
    if (prev === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = prev;
  });

  it("retries 429 with Retry-After and exponential backoff", async () => {
    vi.useFakeTimers();
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls <= 2) {
        return new Response("rate limited", {
          status: 429,
          headers: { "Retry-After": "1" },
        });
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"skill":"clarification_needed"}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const client = createFetchLlmClient({
      apiKey: "test-key",
      timeoutMs: 5_000,
    });
    const pending = client.completeJson("system", "user");
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    const raw = await pending;

    expect(calls).toBe(3);
    expect(raw).toContain("clarification_needed");
    expect(client.lastUsage?.()).toMatchObject({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
  });

  it("aborts fetch requests after timeout", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        });
      });
    }) as typeof fetch;

    const client = createFetchLlmClient({
      apiKey: "test-key",
      timeoutMs: 5,
    });
    const pending = client.completeJson("system", "user");
    const assertion = expect(pending).rejects.toThrow(LlmUnavailableError);

    await vi.advanceTimersByTimeAsync(5);
    await assertion;
  });
});

describe("pro escalation helpers", () => {
  it("detects flash-tier models", () => {
    expect(isFlashTierModel("deepseek-v4-flash")).toBe(true);
    expect(isFlashTierModel("deepseek-v4-pro")).toBe(false);
  });

  it("flags repairable clarification for escalation", () => {
    expect(
      evaluateProEscalation(bindings, {
        result: {
          ok: true,
          validation: {
            kind: "clarification",
            message: "x",
            repairable: true,
            zodError: "invalid",
          },
        },
        utterance: "x",
      }),
    ).toMatchObject({ escalate: true, reason: "repairable_json" });
    expect(
      evaluateProEscalation(bindings, {
        result: {
          ok: true,
          validation: { kind: "clarification", message: "哪座棚？" },
        },
        utterance: "x",
      }),
    ).toMatchObject({ escalate: false });
  });
});
