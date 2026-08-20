import { describe, expect, it } from "vitest";
import { formatDurationZh } from "./duration.js";

describe("formatDurationZh", () => {
  it("formats minutes in Chinese", () => {
    expect(formatDurationZh(900)).toBe("15 分钟");
    expect(formatDurationZh(1200)).toBe("20 分钟");
  });

  it("formats non-round seconds", () => {
    expect(formatDurationZh(90)).toBe("90 秒");
  });
});
