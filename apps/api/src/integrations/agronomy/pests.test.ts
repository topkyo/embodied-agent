import { describe, expect, it } from "vitest";
import { formatPestAdviceReply, lookupPestAdvice } from "./pests.js";

describe("agronomy pests", () => {
  it("finds high humidity advice", () => {
    const hits = lookupPestAdvice("高湿容易得什么病");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.title).toContain("高湿");
  });

  it("returns helpful message when no match", () => {
    const reply = formatPestAdviceReply("xyz未知病害");
    expect(reply).toContain("未在知识库中找到");
  });
});
