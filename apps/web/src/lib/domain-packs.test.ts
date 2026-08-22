import { describe, expect, it } from "vitest";
import {
  adminPlatformPath,
  buildWechatStartUrl,
  isLiveOpsPack,
  resolvePackById,
  sceneOpsEntryPath,
} from "./domain-packs";
import { resolvePackBySlug } from "./domain-packs";

describe("buildWechatStartUrl", () => {
  it("builds base path without scene query", () => {
    expect(buildWechatStartUrl()).toBe("/start/wechat");
  });

  it("builds no_redirect flag", () => {
    expect(buildWechatStartUrl({ noRedirect: true })).toBe("/start/wechat?no_redirect=1");
  });
});

describe("domain pack canonical ids", () => {
  it("keeps marketing slugs separate from backend pack ids", () => {
    const greenhouse = resolvePackBySlug("greenhouse");
    const robot = resolvePackBySlug("robot");
    const industrial = resolvePackBySlug("industrial");
    expect(greenhouse && isLiveOpsPack(greenhouse) ? greenhouse.packId : null).toBe("agriculture");
    expect(robot && isLiveOpsPack(robot) ? robot.packId : null).toBe("robotics");
    expect(industrial && isLiveOpsPack(industrial) ? industrial.packId : null).toBe("industrial");
    expect(resolvePackById("agriculture")?.slug).toBe("greenhouse");
    expect(resolvePackById("robotics")?.slug).toBe("robot");
    expect(resolvePackById("industrial")?.slug).toBe("industrial");
  });
});

describe("adminPlatformPath", () => {
  it("points to platform tab without role query", () => {
    expect(adminPlatformPath("greenhouse")).toBe("/scenes/greenhouse/ops/platform");
    expect(adminPlatformPath("industrial")).toBe("/scenes/industrial/ops/platform");
  });

  it("does not fallback for non-LIVE or unknown packs", () => {
    expect(adminPlatformPath("aquaculture")).toBeNull();
    expect(adminPlatformPath("not-a-pack")).toBeNull();
  });
});

describe("sceneOpsEntryPath", () => {
  it("uses ops path for LIVE pack", () => {
    const pack = resolvePackBySlug("greenhouse");
    expect(pack).toBeDefined();
    expect(sceneOpsEntryPath(pack!)).toBe("/scenes/greenhouse/ops");
  });

  it("does not create ops path for non-LIVE pack", () => {
    const pack = resolvePackBySlug("aquaculture");
    expect(pack).toBeDefined();
    expect(sceneOpsEntryPath(pack!)).toBeNull();
  });
});
