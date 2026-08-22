import { afterEach, describe, expect, it } from "vitest";
import type { AgentSettingsSlice } from "../runtime-bindings.js";
import { bindTestAgentRuntime } from "../../test/bind-test-runtime.js";
import {
  buildDeploymentContextCached,
  clearDeploymentContextCacheForTests,
} from "./deployment-context.js";

describe("buildDeploymentContextCached", () => {
  let bindings: ReturnType<typeof bindTestAgentRuntime>;

  afterEach(() => {
    clearDeploymentContextCacheForTests();
  });

  it("keys the cache by active domain and active domain config", async () => {
    let activeDomain = "agriculture";
    let agricultureVersion = 1;
    let roboticsVersion = 1;
    const settings = (): AgentSettingsSlice => ({
      deployment_id: "dep-test",
      deployment_name: "test",
      llm_provider: "deepseek",
      llm_base_url: "https://api.deepseek.com",
      llm_model: "deepseek-chat",
      stt_provider: "none",
      stt_model: "",
      active_domain: activeDomain,
      domain_configs: {
        agriculture: { version: agricultureVersion },
        robotics: { version: roboticsVersion },
      },
    });
    bindings = bindTestAgentRuntime({
      getEffectiveSettings: settings,
      loadRegistry: () => ({ deployments: [], entities: [], devices: [] }),
      buildSceneDeploymentContext: (s) => ({
        scene_context_sections: [
          `${s.active_domain}:${JSON.stringify(s.domain_configs?.[s.active_domain ?? ""])}`,
        ],
      }),
    });

    const agriculture = await buildDeploymentContextCached(bindings);
    activeDomain = "robotics";
    const robotics = await buildDeploymentContextCached(bindings);
    roboticsVersion = 2;
    const roboticsUpdated = await buildDeploymentContextCached(bindings);
    activeDomain = "agriculture";
    agricultureVersion = 2;
    const agricultureUpdated = await buildDeploymentContextCached(bindings);

    expect(agriculture.scene_context_sections[0]).toBe('agriculture:{"version":1}');
    expect(robotics.scene_context_sections[0]).toBe('robotics:{"version":1}');
    expect(roboticsUpdated.scene_context_sections[0]).toBe('robotics:{"version":2}');
    expect(agricultureUpdated.scene_context_sections[0]).toBe('agriculture:{"version":2}');
  });
});
