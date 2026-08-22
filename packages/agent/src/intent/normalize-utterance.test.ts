import { describe, expect, it } from "vitest";
import { normalizeUtterance } from "./normalize-utterance.js";
import { bindTestAgentRuntime } from "../../test/bind-test-runtime.js";

const bindings = bindTestAgentRuntime();

describe("normalizeUtterance", () => {
  it("fixes 盆/盘 ASR to 棚", () => {
    expect(normalizeUtterance(bindings, "1号盆打开10分钟")).toBe("1号棚打开10分钟");
    expect(normalizeUtterance(bindings, "二号盘通风")).toBe("二号棚通风");
  });
});
