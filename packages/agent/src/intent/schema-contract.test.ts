import { describe, expect, it } from "vitest";
import { INTENT_SCHEMA_CHEATSHEET } from "./generated/intent-cheatsheet.js";
import {
  INTENT_SCHEMA_CHEATSHEET_SOURCE,
  buildSchemaRepairUserMessage,
} from "./schema-contract.js";

describe("schema-contract", () => {
  it("generated cheatsheet matches source (run npm run codegen:intent after edits)", () => {
    expect(INTENT_SCHEMA_CHEATSHEET).toBe(INTENT_SCHEMA_CHEATSHEET_SOURCE);
  });

  it("buildSchemaRepairUserMessage embeds contract", () => {
    const msg = buildSchemaRepairUserMessage({
      originalUtterance: "1号棚30度报警",
      invalidJson: { skill: "alert.set_threshold" },
      zodError: "missing operator",
      intentContract: INTENT_SCHEMA_CHEATSHEET,
    });
    expect(msg).toContain("1号棚30度报警");
    expect(msg).toContain("alert.set_threshold");
    expect(msg).toContain(INTENT_SCHEMA_CHEATSHEET.slice(0, 40));
  });

  it("throws when repair contract is missing", () => {
    expect(() =>
      buildSchemaRepairUserMessage({
        originalUtterance: "1号棚30度报警",
        invalidJson: { skill: "alert.set_threshold" },
        zodError: "missing operator",
      }),
    ).toThrow(/intentContract/);
  });
});
