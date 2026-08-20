import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getDeploymentDisplayName, t, translations } from "./i18n";

const zh = translations.zh;
const en = translations.en;

describe("t", () => {
  it("returns zh translation for known key", () => {
    expect(t("nav.settings", "zh")).toBe("配置台");
  });

  it("interpolates params", () => {
    expect(t("settings.intentFailures.result.promoted", "zh", { n: "3" })).toContain("3");
  });

  it("returns key when missing in en", () => {
    expect(t("nonexistent.key.xyz", "en")).toBe("nonexistent.key.xyz");
  });

  it("has English sceneOps nav keys", () => {
    expect(t("sceneOps.nav.overview", "en")).toBe("Overview");
    expect(t("sceneOps.topbar", "en")).not.toContain("sceneOps.");
  });

  it("zh and en have the same key set", () => {
    const zhKeys = new Set(Object.keys(zh));
    const enKeys = new Set(Object.keys(en));
    const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k));
    const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));
    expect({ missingInEn, missingInZh }).toEqual({ missingInEn: [], missingInZh: [] });
  });

  it("all sceneOps.robot.* keys are consumed by components", () => {
    const robotKeys = Object.keys(zh).filter((k) => k.startsWith("sceneOps.robot."));
    const consumed = new Set<string>();
    const srcRoot = path.resolve(process.cwd(), "src");
    const scan = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath);
        } else if (entry.isFile() && (fullPath.endsWith(".tsx") || fullPath.endsWith(".ts"))) {
          const content = fs.readFileSync(fullPath, "utf8");
          // t("sceneOps.robot…") 与 fallback 表中的字面量 key 均算消费
          for (const match of content.matchAll(
            /(?:t\()?["'](sceneOps\.robot\.[a-zA-Z0-9_.]+)["']/g,
          )) {
            consumed.add(match[1]);
          }
        }
      }
    };
    scan(srcRoot);
    const unused = robotKeys.filter((k) => !consumed.has(k));
    expect(unused).toEqual([]);
  });
});

describe("getDeploymentDisplayName", () => {
  const translate = (key: string) => (key === "settings.lockup.deploymentDemo" ? "Demo Site" : key);

  it("translates default demo site name", () => {
    expect(getDeploymentDisplayName("示例现场", translate)).toBe("Demo Site");
  });

  it("keeps custom farm name", () => {
    expect(getDeploymentDisplayName("张氏温室", translate)).toBe("张氏温室");
  });
});
