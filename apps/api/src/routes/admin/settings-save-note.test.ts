import { describe, expect, it } from "vitest";
import { settingsSaveNote } from "./settings-save-note.js";

describe("settingsSaveNote", () => {
  it("returns LLM note when llm fields are patched", () => {
    expect(settingsSaveNote({ llm_model: "x" })).toContain("LLM");
  });

  it("returns undefined for scene-only patches", () => {
    expect(settingsSaveNote({ deployment_name: "农场" })).toBeUndefined();
    expect(settingsSaveNote({ nlg_enabled: true })).toBeUndefined();
  });
});
