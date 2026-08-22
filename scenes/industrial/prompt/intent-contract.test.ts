import { describe, expect, it } from "vitest";
import { INDUSTRIAL_P0_SKILLS, INDUSTRIAL_P1_SKILLS } from "../skills.js";
import { INDUSTRIAL_INTENT_CONTRACT } from "./intent-contract.js";

describe("INDUSTRIAL_INTENT_CONTRACT", () => {
  it("mentions only registered industrial skills and covers every skill", () => {
    const registered = new Set<string>([...INDUSTRIAL_P0_SKILLS, ...INDUSTRIAL_P1_SKILLS]);
    const mentioned = new Set(
      [...INDUSTRIAL_INTENT_CONTRACT.matchAll(/(?:^[-]\s*|"skill":")([a-z]+\.[a-z_]+)/gm)].map(
        (m) => m[1],
      ),
    );

    expect([...mentioned].filter((skill) => !registered.has(skill))).toEqual([]);
    expect([...registered].filter((skill) => !mentioned.has(skill))).toEqual([]);
  });
});
