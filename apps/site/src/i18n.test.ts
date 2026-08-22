import { describe, expect, it } from "vitest";
import { t, translations } from "./i18n";

const zh = translations.zh;
const en = translations.en;

describe("site i18n", () => {
  it("returns zh translation for platform scenes CTA", () => {
    expect(t("platform.cta.scenes", "zh")).toBe("领域展开");
  });

  it("zh and en have the same key set", () => {
    const zhKeys = new Set(Object.keys(zh));
    const enKeys = new Set(Object.keys(en));
    const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k));
    const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));
    expect({ missingInEn, missingInZh }).toEqual({ missingInEn: [], missingInZh: [] });
  });

  it("shortens primary nav labels for segmented topbar", () => {
    expect(t("nav.hardware", "zh")).toBe("智能硬件");
    expect(t("nav.scenes", "zh")).toBe("领域展开");
    expect(t("nav.hardware.short", "zh")).toBe("硬件");
    expect(t("nav.scenes.short", "zh")).toBe("领域");
  });
});
