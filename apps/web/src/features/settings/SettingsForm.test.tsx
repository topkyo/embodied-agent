import { describe, expect, it } from "vitest";

// SettingsForm.tsx is a pure re-export module — verify all named exports resolve.
import {
  PlatformSettingsForm,
  SceneSettingsForm,
  SettingsField,
  fieldAria,
  SettingsSection,
} from "./SettingsForm";

describe("SettingsForm re-exports", () => {
  it("exports PlatformSettingsForm as a function component", () => {
    expect(typeof PlatformSettingsForm).toBe("function");
  });

  it("exports SceneSettingsForm as a function component", () => {
    expect(typeof SceneSettingsForm).toBe("function");
  });

  it("exports SettingsField as a function component", () => {
    expect(typeof SettingsField).toBe("function");
  });

  it("exports SettingsSection as a function component", () => {
    expect(typeof SettingsSection).toBe("function");
  });

  it("exports fieldAria as a function", () => {
    expect(typeof fieldAria).toBe("function");
  });
});
