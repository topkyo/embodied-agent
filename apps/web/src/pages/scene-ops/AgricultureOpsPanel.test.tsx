import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AdminOverview } from "../../api";
import { AuthProvider } from "../../contexts/AuthContext";
import { LanguageProvider } from "../../contexts/LanguageContext";
import { renderWithProviders } from "../../test-utils";
import { AgricultureOverviewPanel } from "./AgricultureOpsPanel";

function overviewWithGreenhouse(temp = 24.5): AdminOverview {
  return {
    deployment_id: "dep-1",
    deployment_name: "Greenhouse Demo",
    entities: [
      {
        entity_id: "gh-001",
        entity_type: "greenhouse",
        domain_id: "agriculture",
        name: "1号棚",
        stale: false,
        reported_at: "2026-07-16T04:00:00.000Z",
        telemetry: {
          temperature_c: temp,
          humidity_percent: 62,
          vent_status: "closed",
          fan_status: "off",
        },
      },
    ],
    nodes: [],
    services: {
      api: "ok",
      deployment_id: "dep-1",
      deployment_name: "Greenhouse Demo",
      llm_configured: false,
      llm_provider: "deepseek",
      llm_model: "",
      stt_model: "",
      stt_provider: "none",
      stt_enabled: false,
      mqtt_url: "",
      chat_channel: "wechat",
      alert_push_enabled: true,
      digest_enabled: true,
      digest_morning_hour: 7,
      digest_evening_hour: 18,
      digest_timezone: "Asia/Shanghai",
    },
    pending_confirms_count: 0,
    pending_confirms: [],
    active_alert_rules_count: 0,
  };
}

describe("AgricultureOverviewPanel", () => {
  it("applies flash class when metric value changes", () => {
    const t = (key: string) => key;
    const { rerender, container } = renderWithProviders({
      initialEntries: ["/"],
      lang: "en",
      children: <AgricultureOverviewPanel overview={overviewWithGreenhouse(24.5)} t={t} />,
    });

    expect(screen.getByText("24.5°C")).toBeInTheDocument();

    rerender(
      <LanguageProvider>
        <MemoryRouter initialEntries={["/"]}>
          <AuthProvider>
            <AgricultureOverviewPanel overview={overviewWithGreenhouse(26.0)} t={t} />
          </AuthProvider>
        </MemoryRouter>
      </LanguageProvider>,
    );

    expect(container.querySelector(".greenhouse-metric--flash")).toBeTruthy();
  });
});
