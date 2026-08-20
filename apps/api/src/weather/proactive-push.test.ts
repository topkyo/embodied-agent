import { allocateAgentDataDir, releaseAgentDataDir } from "../test/isolated-data-dir.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearWeatherProactiveKeysForTests,
  evaluateWeatherProactivePush,
} from "./proactive-push.js";
import { upsertBinding } from "../auth/platform-bind.js";
import { saveSettings } from "../settings/store.js";
import { seedCanonicalSimRegistry } from "../test/registry-fixture.js";
import { seedDefaultUsers } from "../test/users-fixture.js";
import { listPendingConfirmsForUser } from "../policy/pending-confirm.js";

const sendMock = vi.fn(async (_platformUserId: string, _message: string): Promise<boolean> => true);
const renderMock = vi.fn(async ({ templateText }: { templateText: string }) => templateText);

vi.mock("../channels/proactive-send.js", () => ({
  defaultProactiveSend: (platformUserId: string, message: string) =>
    sendMock(platformUserId, message),
}));

vi.mock("../nlg/render-reply.js", () => ({
  renderProactiveSummary: (opts: { templateText: string }) => renderMock(opts),
}));

vi.mock("../integrations/weather/open-meteo.js", () => ({
  fetchWeatherForecast: async () => ({ hourly: [] }),
  detectColdWaveAlert: () => null,
  detectHeatAlert: () => null,
}));

let testDir: string;

describe("weather proactive push", () => {
  beforeEach(() => {
    testDir = allocateAgentDataDir("test");
    process.env.FLYWHEEL_DEV = "1";
    process.env.NODE_ENV = "test";
    seedCanonicalSimRegistry();
    seedDefaultUsers();
    upsertBinding("wechat", "wx-owner", "owner-001");
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      deployment_name: "测试农场",
      llm_api_key: "k",
      llm_model: "mock",
      weather_proactive_enabled: true,
      alert_push_enabled: true,
    });
    sendMock.mockClear();
    clearWeatherProactiveKeysForTests();
  });
  afterEach(() => {
    delete process.env.FLYWHEEL_DEV;
    delete process.env.NODE_ENV;
    releaseAgentDataDir(testDir);
  });

  it("re-sends forced cold when flywheel dev skip dedup", async () => {
    const first = await evaluateWeatherProactivePush({ forceCold: true });
    const second = await evaluateWeatherProactivePush({ forceCold: true });
    expect(first.cold).toBeGreaterThan(0);
    expect(second.cold).toBeGreaterThan(0);
    expect(sendMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("force heat in flywheel dev pushes heat alert without forecast", async () => {
    const result = await evaluateWeatherProactivePush({ forceHeat: true });
    expect(result.heat).toBeGreaterThan(0);
    expect(sendMock).toHaveBeenCalled();
    expect(
      listPendingConfirmsForUser("owner-001").some(
        (row) =>
          row.scene_skill_id === "night_ventilation_control" &&
          row.intent.skill === "greenhouse.set_mode",
      ),
    ).toBe(true);
  });
});
