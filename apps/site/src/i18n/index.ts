import type { Lang } from "./types.js";
import { zh } from "./zh.js";
import { en } from "./en.js";

export type { Lang } from "./types.js";

export const translations: Record<Lang, Record<string, string>> = { zh, en };

export const DEFAULT_DEPLOYMENT_DEMO_NAME_ZH = "示例现场";

export function getDeploymentDisplayName(
  deploymentName: string | undefined,
  translate: (key: string) => string,
): string {
  if (!deploymentName || deploymentName === DEFAULT_DEPLOYMENT_DEMO_NAME_ZH) {
    return translate("settings.lockup.deploymentDemo");
  }
  return deploymentName;
}

export function t(key: string, lang: Lang, params?: Record<string, string>): string {
  const dict = translations[lang] || translations.zh;
  let str = dict[key] ?? key;
  if (params) {
    Object.keys(params).forEach((k) => {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), params[k]);
    });
  }
  return str;
}

export function getCurrentLang(): Lang {
  if (typeof window === "undefined") return "zh";
  const stored = window.localStorage.getItem("ea_lang") as Lang | null;
  if (stored === "zh" || stored === "en") return stored;
  return navigator.language?.startsWith("en") ? "en" : "zh";
}
