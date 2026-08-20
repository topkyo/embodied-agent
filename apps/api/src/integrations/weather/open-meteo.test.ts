import { describe, expect, it, vi, afterEach } from "vitest";
import {
  clearWeatherCacheForTests,
  detectColdWaveAlert,
  fetchWeatherForecast,
  formatForecastSnippet,
  weatherCodeLabel,
} from "./open-meteo.js";

describe("open-meteo", () => {
  afterEach(() => {
    clearWeatherCacheForTests();
    vi.restoreAllMocks();
  });

  it("maps weather codes to Chinese labels", () => {
    expect(weatherCodeLabel(0)).toBe("晴");
    expect(weatherCodeLabel(61)).toBe("雨");
  });

  it("parses forecast response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          latitude: 31.2,
          longitude: 121.5,
          hourly: {
            time: ["2026-06-08T12:00", "2026-06-08T13:00"],
            temperature_2m: [28.5, 29.1],
            precipitation: [0, 0.2],
            weather_code: [1, 61],
            windspeed_10m: [10, 12],
          },
          daily: {
            time: ["2026-06-08", "2026-06-09"],
            temperature_2m_max: [30, 32],
            temperature_2m_min: [22, 1.5],
            precipitation_sum: [0, 5],
            weather_code: [1, 3],
          },
        }),
      })),
    );

    const forecast = await fetchWeatherForecast(31.2, 121.5, 24);
    expect(forecast.hourly).toHaveLength(2);
    expect(formatForecastSnippet(forecast)).toContain("28.5°C");
    const cold = detectColdWaveAlert(forecast);
    expect(cold?.active).toBe(true);
  });
});
