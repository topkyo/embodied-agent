import { describe, expect, it } from "vitest";
import {
  buildCompoundDeploymentWeatherIntents,
  isCompoundDeploymentWeatherQuery,
} from "./compound-query.js";

describe("compound farm weather query", () => {
  it("detects greenhouse overview + weather", () => {
    expect(isCompoundDeploymentWeatherQuery("现在大盘情况怎么样？天气怎么样")).toBe(true);
    expect(isCompoundDeploymentWeatherQuery("两个大棚状态如何，明天会下雨吗")).toBe(true);
  });

  it("does not match weather-only", () => {
    expect(isCompoundDeploymentWeatherQuery("天气如何")).toBe(false);
    expect(isCompoundDeploymentWeatherQuery("明天天气怎么样")).toBe(false);
  });

  it("builds dual query intents", () => {
    const { status, weather } = buildCompoundDeploymentWeatherIntents("dep-gh-pilot-001");
    expect(status.skill).toBe("greenhouse.query_all_status");
    expect(weather.skill).toBe("weather.query_forecast");
    expect(weather.skill).toBe("weather.query_forecast");
    if (weather.skill === "weather.query_forecast") {
      expect(weather.parameters?.hours).toBe(24);
    }
  });
});
