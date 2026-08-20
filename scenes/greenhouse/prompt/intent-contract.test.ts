import { describe, expect, it } from "vitest";
import { GREENHOUSE_P0_SKILLS, GREENHOUSE_P1_SKILLS } from "../skills.js";
import { GREENHOUSE_INTENT_CONTRACT } from "./intent-contract.js";

describe("greenhouse intent contract", () => {
  it("mentions only registered greenhouse skills and covers every skill", () => {
    const registered = new Set<string>([...GREENHOUSE_P0_SKILLS, ...GREENHOUSE_P1_SKILLS]);
    const mentioned = new Set<string>();
    for (const match of GREENHOUSE_INTENT_CONTRACT.matchAll(
      /^-\s+([a-z]+\.[a-z_]+)(?:\s*\/\s*([a-z]+\.[a-z_]+))?/gm,
    )) {
      mentioned.add(match[1]);
      if (match[2]) mentioned.add(match[2]);
    }
    for (const match of GREENHOUSE_INTENT_CONTRACT.matchAll(/"skill":"([a-z]+\.[a-z_]+)"/g)) {
      mentioned.add(match[1]);
    }

    expect([...mentioned].filter((skill) => !registered.has(skill))).toEqual([]);
    expect([...registered].filter((skill) => !mentioned.has(skill))).toEqual([]);
  });
});
