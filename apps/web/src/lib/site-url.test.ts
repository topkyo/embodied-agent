// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { isExternalSiteUrl, siteUrl } from "./site-url";

describe("siteUrl (dev default)", () => {
  afterEach(() => {
    localStorage.removeItem("ea_lang");
  });

  it("points at local marketing port when VITE_SITE_URL unset", () => {
    expect(siteUrl("/")).toBe("http://127.0.0.1:5170/");
    expect(siteUrl("/scenes")).toBe("http://127.0.0.1:5170/scenes");
  });

  it("uses current hostname for peer site when opened via LAN IP", () => {
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, hostname: "192.168.2.38" },
    });
    expect(siteUrl("/")).toBe("http://192.168.2.38:5170/");
    Object.defineProperty(window, "location", {
      configurable: true,
      value: original,
    });
  });

  it("appends ?lang=en when localStorage has ea_lang=en", () => {
    localStorage.setItem("ea_lang", "en");
    expect(siteUrl("/")).toBe("http://127.0.0.1:5170/?lang=en");
    expect(siteUrl("/scenes")).toBe("http://127.0.0.1:5170/scenes?lang=en");
  });

  it("appends &lang= when path already has query string", () => {
    localStorage.setItem("ea_lang", "zh");
    expect(siteUrl("/scenes?category=ai")).toBe(
      "http://127.0.0.1:5170/scenes?category=ai&lang=zh",
    );
  });

  it("ignores invalid localStorage values", () => {
    localStorage.setItem("ea_lang", "fr");
    expect(siteUrl("/")).toBe("http://127.0.0.1:5170/");
  });

  it("marks absolute marketing base as external", () => {
    expect(isExternalSiteUrl()).toBe(true);
  });
});
