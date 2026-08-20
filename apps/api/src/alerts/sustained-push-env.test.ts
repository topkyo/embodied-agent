import { afterEach, describe, expect, it } from "vitest";
import { l2CooldownSec } from "./sustained-push.js";

describe("l2CooldownSec", () => {
  afterEach(() => {
    delete process.env.SUSTAINED_L2_COOLDOWN_SECONDS;
  });

  it("defaults to 3600 when env unset", () => {
    expect(l2CooldownSec()).toBe(3600);
  });

  it("accepts zero for fast flywheel", () => {
    process.env.SUSTAINED_L2_COOLDOWN_SECONDS = "0";
    expect(l2CooldownSec()).toBe(0);
  });

  it("falls back to default when env is invalid", () => {
    process.env.SUSTAINED_L2_COOLDOWN_SECONDS = "not-a-number";
    expect(l2CooldownSec()).toBe(3600);
  });
});
