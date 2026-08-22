// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { isExternalWebAppUrl, webAppUrl } from "./web-app-url";

describe("webAppUrl (dev default)", () => {
  afterEach(() => {
    localStorage.removeItem("ea_lang");
  });

  it("points workbench paths at local web port when VITE_WEB_APP_URL unset", () => {
    // vitest/site 跑在 DEV；未设 VITE_WEB_APP_URL 时应落到 :5173
    expect(webAppUrl("/start")).toBe("http://127.0.0.1:5173/start");
    expect(webAppUrl("/login")).toBe("http://127.0.0.1:5173/login");
    expect(webAppUrl("/start/wechat")).toBe("http://127.0.0.1:5173/start/wechat");
    expect(webAppUrl("start/wechat?role=user")).toBe(
      "http://127.0.0.1:5173/start/wechat?role=user",
    );
  });

  it("uses current hostname for peer workbench when opened via LAN IP", () => {
    const original = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...original, hostname: "192.168.2.38" },
    });
    expect(webAppUrl("/login")).toBe("http://192.168.2.38:5173/login");
    Object.defineProperty(window, "location", {
      configurable: true,
      value: original,
    });
  });

  it("appends ?lang=en when localStorage has ea_lang=en", () => {
    localStorage.setItem("ea_lang", "en");
    expect(webAppUrl("/login")).toBe("http://127.0.0.1:5173/login?lang=en");
    expect(webAppUrl("/start?pack=greenhouse")).toBe(
      "http://127.0.0.1:5173/start?pack=greenhouse&lang=en",
    );
  });

  it("appends &lang= when path already has query or base has query (start/wechat)", () => {
    localStorage.setItem("ea_lang", "zh");
    expect(webAppUrl("start/wechat?role=user")).toBe(
      "http://127.0.0.1:5173/start/wechat?role=user&lang=zh",
    );
  });

  it("omits ?lang= when localStorage has invalid value", () => {
    localStorage.setItem("ea_lang", "fr");
    expect(webAppUrl("/login")).toBe("http://127.0.0.1:5173/login");
  });

  it("marks absolute workbench as external", () => {
    expect(isExternalWebAppUrl()).toBe(true);
  });
});
