import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import type { AdminOverview, SceneOutcomeRow } from "../../api";
import { renderWithProviders } from "../../test-utils";
import { SiteViewPanel } from "./SiteViewPanel";

function emptyOverview(): AdminOverview {
  return {
    deployment_id: "dep-1",
    deployment_name: "Industrial Demo",
    entities: [],
    nodes: [],
    services: {
      api: "ok",
      deployment_id: "dep-1",
      deployment_name: "Industrial Demo",
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

function overviewWithCabinet(): AdminOverview {
  return {
    ...emptyOverview(),
    active_alert_rules_count: 1,
    entities: [
      {
        entity_id: "cabinet-001",
        entity_type: "cabinet",
        domain_id: "industrial",
        name: "1号柜",
        stale: false,
        reported_at: "2026-07-16T04:00:00.000Z",
        telemetry: {
          temperature_c: 42.5,
          fan_status: "on",
        },
      },
    ],
  };
}

describe("SiteViewPanel", () => {
  it("shows em dash placeholders when there is no entity or outcome data", () => {
    renderWithProviders({
      initialEntries: ["/"],
      lang: "zh",
      children: <SiteViewPanel overview={emptyOverview()} t={(k) => k} />,
    });

    expect(screen.getByText("sceneOps.siteView.title")).toBeInTheDocument();
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the site-view title when overview has cabinet telemetry", () => {
    renderWithProviders({
      initialEntries: ["/"],
      lang: "zh",
      children: (
        <SiteViewPanel
          overview={overviewWithCabinet()}
          t={(key) => {
            const map: Record<string, string> = {
              "sceneOps.siteView.title": "现场视图",
              "sceneOps.siteView.lead": "柜体拓扑与测点",
              "sceneOps.siteView.svgLabel": "现场示意",
              "sceneOps.siteView.temp": "温度",
              "sceneOps.siteView.exhaust": "排风",
              "sceneOps.siteView.alert": "告警",
              "sceneOps.siteView.alertActive": "启用阈值 {count}",
              "sceneOps.siteView.status": "状态",
              "sceneOps.siteView.outcomes": "近期结果",
              "console.overview.live": "实时",
              "console.overview.stale": "陈旧",
              "sceneOps.review.outcomes.ok": "达标",
              "sceneOps.review.outcomes.fail": "未达标",
            };
            return map[key] ?? key;
          }}
        />
      ),
    });

    expect(screen.getByText("现场视图")).toBeInTheDocument();
    expect(screen.getByText("42.5°C")).toBeInTheDocument();
    expect(screen.getByText("on")).toBeInTheDocument();
    expect(screen.getByText("1号柜")).toBeInTheDocument();
  });

  it("applies fan-on and focus-executing classes", () => {
    const { container } = renderWithProviders({
      initialEntries: ["/"],
      lang: "zh",
      children: (
        <SiteViewPanel
          overview={overviewWithCabinet()}
          executing
          t={(key) => {
            const map: Record<string, string> = {
              "sceneOps.siteView.title": "现场视图",
              "sceneOps.siteView.lead": "柜体拓扑与测点",
              "sceneOps.siteView.svgLabel": "现场示意",
              "sceneOps.siteView.temp": "温度",
              "sceneOps.siteView.exhaust": "排风",
              "sceneOps.siteView.alert": "告警",
              "sceneOps.siteView.alertActive": "启用阈值 {count}",
              "sceneOps.siteView.status": "状态",
              "sceneOps.siteView.outcomes": "近期结果",
              "console.overview.live": "实时",
              "console.overview.stale": "陈旧",
            };
            return map[key] ?? key;
          }}
        />
      ),
    });

    expect(container.querySelector(".site-view--focus-executing")).toBeTruthy();
    expect(container.querySelector(".site-view-fan--on")).toBeTruthy();
    expect(container.querySelector(".site-view-alert")).toBeTruthy();
  });

  it("renders a short outcome trail when outcomes are provided", () => {
    const outcomes: SceneOutcomeRow[] = [
      {
        ts: "2026-07-16T03:00:00.000Z",
        deployment_id: "dep-1",
        scene_skill_id: "industrial_overheat_exhaust",
        entity_id: "cabinet-001",
        success: true,
        metrics: {},
      },
    ];
    renderWithProviders({
      initialEntries: ["/"],
      lang: "zh",
      children: (
        <SiteViewPanel
          overview={overviewWithCabinet()}
          outcomes={outcomes}
          t={(key) => {
            if (key === "sceneOps.siteView.title") return "现场视图";
            if (key === "sceneOps.siteView.lead") return "lead";
            if (key === "sceneOps.siteView.svgLabel") return "svg";
            if (key === "sceneOps.siteView.temp") return "温度";
            if (key === "sceneOps.siteView.exhaust") return "排风";
            if (key === "sceneOps.siteView.alert") return "告警";
            if (key === "sceneOps.siteView.alertActive") return "告警中";
            if (key === "sceneOps.siteView.status") return "状态";
            if (key === "sceneOps.siteView.outcomes") return "近期结果";
            if (key === "console.overview.live") return "实时";
            if (key === "sceneOps.review.outcomes.ok") return "达标";
            if (key === "sceneOps.review.skill.industrial_overheat_exhaust") return "过温排风";
            return key;
          }}
        />
      ),
    });

    expect(screen.getByText(/过温排风/)).toBeInTheDocument();
    expect(screen.getByText(/达标/)).toBeInTheDocument();
  });
});
