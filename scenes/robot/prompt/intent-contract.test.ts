import { describe, expect, it } from "vitest";
import { ROBOT_P0_SKILLS, ROBOT_P1_SKILLS } from "../skills.js";
import { ROBOT_INTENT_CONTRACT } from "./intent-contract.js";

describe("robot intent contract", () => {
  it("mentions only registered robot skills and covers every skill", () => {
    const registered = new Set<string>([...ROBOT_P0_SKILLS, ...ROBOT_P1_SKILLS]);
    const mentioned = new Set(ROBOT_INTENT_CONTRACT.match(/\brobot\.[a-z_]+/g) ?? []);

    expect([...mentioned].filter((skill) => !registered.has(skill))).toEqual([]);
    expect([...registered].filter((skill) => !mentioned.has(skill))).toEqual([]);
  });
});
