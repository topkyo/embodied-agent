import { describe, expect, it, beforeEach } from "vitest";
import {
  clearInboundDedupForTest,
  isInboundDuplicate,
  markInboundProcessed,
} from "./inbound-dedup.js";

describe("inbound-dedup", () => {
  beforeEach(() => {
    clearInboundDedupForTest();
  });

  it("does not mark duplicate until explicitly processed", () => {
    expect(isInboundDuplicate("acct", "user", "tok-1")).toBe(false);
    expect(isInboundDuplicate("acct", "user", "tok-1")).toBe(false);
    markInboundProcessed("acct", "user", "tok-1");
    expect(isInboundDuplicate("acct", "user", "tok-1")).toBe(true);
  });

  it("allows final voice packet after partial wait without dedup skip", () => {
    expect(isInboundDuplicate("acct", "user", "voice-tok")).toBe(false);
    // 模拟语音分片：只 waiting，不 mark
    expect(isInboundDuplicate("acct", "user", "voice-tok")).toBe(false);
    markInboundProcessed("acct", "user", "voice-tok");
    expect(isInboundDuplicate("acct", "user", "voice-tok")).toBe(true);
  });

  it("allows retry when send fails before mark", () => {
    expect(isInboundDuplicate("acct", "user", "tok-retry")).toBe(false);
    // 模拟 handleInbound 发送失败：未 mark，下次轮询可重试
    expect(isInboundDuplicate("acct", "user", "tok-retry")).toBe(false);
  });
});
