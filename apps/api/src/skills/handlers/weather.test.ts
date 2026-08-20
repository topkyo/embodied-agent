import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allocateAgentDataDir, releaseAgentDataDir } from "../../test/isolated-data-dir.js";
import { saveSettings } from "../../settings/store.js";
import { handleWeatherSkill } from "./weather.js";

/**
 * 回归：LLM 常返回 weather.query_forecast 且省略 parameters，
 * 旧实现会在 params.hours 上 TypeError 并对外「技能执行失败」。
 */
describe("handleWeatherSkill", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = allocateAgentDataDir("weather-handler");
    saveSettings({
      deployment_id: "dep-test",
      deployment_name: "test",
      geo_latitude: 31.23,
      geo_longitude: 121.47,
      geo_coordinates_source: "manual",
    });
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("LLM 省略 parameters 时默认 24h 且不抛错", async () => {
    const result = await handleWeatherSkill({
      skill: "weather.query_forecast",
      target: {},
      confidence: 0.95,
    } as never);

    expect(result.reply).toEqual(expect.any(String));
    expect(result.reply.length).toBeGreaterThan(10);
    expect(result.params).toMatchObject({ deployment_id: "dep-test", hours: 24 });
  });

  it("parameters.hours 合法时透传", async () => {
    const result = await handleWeatherSkill({
      skill: "weather.query_forecast",
      target: {},
      parameters: { hours: 6 },
      confidence: 0.9,
    } as never);

    expect(result.params).toMatchObject({ hours: 6 });
  });
});
