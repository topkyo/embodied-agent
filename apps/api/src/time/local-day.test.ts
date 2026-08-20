import { describe, expect, it } from "vitest";
import { localDateKey } from "./local-day.js";

describe("localDateKey", () => {
  it("uses configured timezone instead of UTC date", () => {
    expect(localDateKey("2026-06-06T16:10:00.000Z", "Asia/Shanghai")).toBe("2026-06-07");
    expect(localDateKey("2026-06-06T16:10:00.000Z", "UTC")).toBe("2026-06-06");
  });
});
