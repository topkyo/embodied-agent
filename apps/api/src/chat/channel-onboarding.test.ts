import { beforeEach, describe, expect, it, vi } from "vitest";

const getPrimaryDomainPackContract = vi.fn();
const getPlatformRuntimeContext = vi.fn(() => ({ loader: {} }));
const getEffectiveSettings = vi.fn(() => ({ active_domain: "agriculture" }));

vi.mock("../domain-packs/loader.js", () => ({
  getPrimaryDomainPackContract: (...args: unknown[]) => getPrimaryDomainPackContract(...args),
}));

vi.mock("../runtime/context.js", () => ({
  getPlatformRuntimeContext: () => getPlatformRuntimeContext(),
}));

vi.mock("../settings/store.js", () => ({
  getEffectiveSettings: () => getEffectiveSettings(),
}));

import {
  CHANNEL_HELP_KEYWORDS,
  formatChannelOnboardingTip,
  isChannelHelpKeyword,
  resolveActiveChannelOnboardingExamples,
} from "./channel-onboarding.js";

describe("isChannelHelpKeyword", () => {
  it.each(CHANNEL_HELP_KEYWORDS)("matches help keyword %s", (keyword) => {
    expect(isChannelHelpKeyword(keyword)).toBe(true);
    expect(isChannelHelpKeyword(`  ${keyword}  `)).toBe(true);
    expect(isChannelHelpKeyword(keyword.toUpperCase())).toBe(true);
  });

  it("does not match partial or unrelated text", () => {
    expect(isChannelHelpKeyword("需要帮助")).toBe(false);
    expect(isChannelHelpKeyword("1号棚温度多少")).toBe(false);
    expect(isChannelHelpKeyword("")).toBe(false);
    expect(isChannelHelpKeyword("   ")).toBe(false);
  });
});

describe("formatChannelOnboardingTip", () => {
  it("formats pack examples", () => {
    expect(formatChannelOnboardingTip(["1号棚温度多少", "开通风", "1号棚关风机"])).toBe(
      "已绑定，可以直接发指令。\n试试：\n· 1号棚温度多少\n· 开通风\n· 1号棚关风机\n回复「帮助」可再次查看。",
    );
  });

  it("falls back when examples are missing", () => {
    expect(formatChannelOnboardingTip(undefined)).toBe(
      "已绑定，可以直接发指令。回复「帮助」查看示例。",
    );
  });

  it("treats blank examples as missing", () => {
    expect(formatChannelOnboardingTip(["", "   "])).toBe(
      "已绑定，可以直接发指令。回复「帮助」查看示例。",
    );
  });

  it("trims examples and caps at four", () => {
    expect(
      formatChannelOnboardingTip([
        "  第一条  ",
        "第二条",
        "第三条",
        "第四条",
        "第五条",
      ]),
    ).toBe(
      "已绑定，可以直接发指令。\n试试：\n· 第一条\n· 第二条\n· 第三条\n· 第四条\n回复「帮助」可再次查看。",
    );
  });
});

describe("resolveActiveChannelOnboardingExamples", () => {
  beforeEach(() => {
    getPrimaryDomainPackContract.mockReset();
    getPlatformRuntimeContext.mockClear();
    getEffectiveSettings.mockClear();
  });

  it("reads examples from active pack contract manifest", () => {
    getPrimaryDomainPackContract.mockReturnValue({
      core: {
        manifest: {
          channelOnboarding: { examples: ["1号棚温度多少", "开通风"] },
        },
      },
    });

    expect(resolveActiveChannelOnboardingExamples()).toEqual(["1号棚温度多少", "开通风"]);
    expect(getPrimaryDomainPackContract).toHaveBeenCalledWith(
      getPlatformRuntimeContext.mock.results[0]?.value.loader,
      { active_domain: "agriculture" },
    );
  });

  it("returns undefined when manifest has no channelOnboarding", () => {
    getPrimaryDomainPackContract.mockReturnValue({
      core: { manifest: {} },
    });

    expect(resolveActiveChannelOnboardingExamples()).toBeUndefined();
  });

  it("returns undefined when contract resolution throws", () => {
    getPrimaryDomainPackContract.mockImplementation(() => {
      throw new Error("pack load failed");
    });

    expect(resolveActiveChannelOnboardingExamples()).toBeUndefined();
  });
});
