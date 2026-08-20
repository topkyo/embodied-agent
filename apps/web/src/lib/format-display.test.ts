import { describe, expect, it } from "vitest";
import { t } from "../i18n";
import {
  formatLocalizedDateTime,
  formatSceneSkillDisplayName,
  formatSkillIdFallback,
  humanizeReadinessDetail,
  humanizeReadinessTitle,
} from "./format-display";

describe("formatLocalizedDateTime", () => {
  it("formats ISO for zh and en without raw T fragment", () => {
    const iso = "2026-03-15T08:30:00.000Z";
    const zh = formatLocalizedDateTime(iso, "zh");
    const en = formatLocalizedDateTime(iso, "en");
    expect(zh).not.toContain("T");
    expect(en).not.toContain("T");
    expect(zh.length).toBeGreaterThan(8);
    expect(en.length).toBeGreaterThan(8);
  });

  it("returns invalid input as-is", () => {
    expect(formatLocalizedDateTime("not-a-date", "zh")).toBe("not-a-date");
  });
});

describe("formatSkillIdFallback", () => {
  it("title-cases snake_case ids", () => {
    expect(formatSkillIdFallback("post_irrigation_ventilation")).toBe(
      "Post Irrigation Ventilation",
    );
  });
});

describe("formatSceneSkillDisplayName", () => {
  it("uses i18n when key exists", () => {
    const translate = (key: string) => t(key, "zh");
    expect(formatSceneSkillDisplayName("post_irrigation_ventilation", translate)).toBe("灌后通风");
  });

  it("falls back to title-case when key missing", () => {
    const translate = (key: string) => key;
    expect(formatSceneSkillDisplayName("custom_scene_skill", translate)).toBe("Custom Scene Skill");
  });
});

describe("humanizeReadinessTitle", () => {
  const translate = (key: string) => t(key, "zh");

  it("maps Domain Registry to human registry label", () => {
    expect(
      humanizeReadinessTitle({ code: "domain_registry", label: "Domain Registry" }, translate),
    ).toBe("设备绑定未就绪");
  });

  it("maps Nodes label", () => {
    expect(humanizeReadinessTitle({ code: "nodes", label: "Nodes" }, translate)).toBe(
      "有设备未在线",
    );
  });
});

describe("humanizeReadinessDetail", () => {
  const translate = (key: string, params?: Record<string, string>) => t(key, "zh", params);

  it("localizes n/m online node counts", () => {
    expect(
      humanizeReadinessDetail({ code: "nodes", label: "Nodes", detail: "0/2 online" }, translate),
    ).toBe("0/2 台在线");
  });
});
