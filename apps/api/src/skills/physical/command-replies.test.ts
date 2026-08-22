import { getPlatformRuntimeContext } from "../../runtime/context.js";
import type { IntentPayload } from "@embodied-agent/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { preloadDomainPacks } from "../../domain-packs/loader.js";
import { saveSettings } from "../../settings/store.js";
import { allocateAgentDataDir, releaseAgentDataDir } from "../../test/isolated-data-dir.js";
import { pendingSummary, physicalCommandSentReply } from "./command-replies.js";

let testDir: string;

describe("command replies", () => {
  beforeAll(async () => {
    await preloadDomainPacks(getPlatformRuntimeContext().loader, { packIds: ["robotics"] });
  });

  beforeEach(() => {
    testDir = allocateAgentDataDir("command-replies");
  });

  afterEach(() => {
    releaseAgentDataDir(testDir);
  });

  it("uses agriculture Domain Pack command replies", () => {
    saveSettings({
      deployment_id: "dep-gh-pilot-001",
      active_domain: "agriculture",
    });

    expect(physicalCommandSentReply("fan.start")).toBe(
      "风机指令已下发，正等待设备确认；若失败会微信通知您。",
    );
    expect(
      pendingSummary({
        skill: "greenhouse.open_vent",
        target: { greenhouse_id: "gh-001" },
        parameters: { duration_seconds: 600 },
      } as IntentPayload),
    ).toBe("gh-001 通风 600 秒");
  });

  it("uses robotics Domain Pack command replies", () => {
    process.env.ACTIVE_DOMAIN = "robotics";
    saveSettings({
      deployment_id: "dep-robot-pilot-001",
      active_domain: "robotics",
    });

    expect(physicalCommandSentReply("robot.move")).toBe("机器人指令已执行并记录。");
    expect(
      pendingSummary({
        skill: "robot.navigate_to_waypoint",
        target: {},
        parameters: { waypoint_id: "dock" },
      } as IntentPayload),
    ).toBe("机器人导航到 dock");
  });
});
