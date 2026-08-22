/**
 * 营销站 → 工作台链接真源。
 * - 生产：必须显式配置 `VITE_WEB_APP_URL`（工作台绝对源，如 https://app.example.com）
 * - 本地 monorepo：site :5170 / web :5173；未配置时 DEV 按当前 hostname 组工作台基址
 *   （真机经局域网 IP 访问时勿写死 127.0.0.1）
 */
function defaultDevWebAppBase(): string {
  if (typeof window === "undefined") return "http://127.0.0.1:5173";
  const host = window.location.hostname;
  if (!host || host === "localhost" || host === "127.0.0.1") {
    return "http://127.0.0.1:5173";
  }
  return `http://${host}:5173`;
}

function resolveWebAppBase(): string {
  const fromEnv = (import.meta.env.VITE_WEB_APP_URL ?? "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) return defaultDevWebAppBase();
  return "";
}

/** Resolve workbench URL; production with empty env keeps same-origin relative paths (reverse-proxy). */
export function webAppUrl(path: string): string {
  const webAppBase = resolveWebAppBase();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const lang = getCurrentLangFromStorage();
  if (!webAppBase) return appendLangParam(normalizedPath, lang);

  const [baseWithoutQuery, baseQuery = ""] = webAppBase.split("?", 2);
  const [pathWithoutQuery, pathQuery = ""] = normalizedPath.split("?", 2);

  if (baseWithoutQuery.endsWith("/start/wechat") && pathWithoutQuery === "/start/wechat") {
    const mergedQuery = [baseQuery, pathQuery].filter(Boolean).join("&");
    const base = mergedQuery ? `${baseWithoutQuery}?${mergedQuery}` : baseWithoutQuery;
    return appendLangParam(base, lang);
  }
  return appendLangParam(`${webAppBase}${normalizedPath}`, lang);
}

/** 跨域 URL 同步追加当前 lang，便于营销站/工作台之间切换语言后保持一致。 */
export function appendLangParam(url: string, lang: string | null): string {
  if (lang !== "zh" && lang !== "en") return url;
  return url.includes("?") ? `${url}&lang=${lang}` : `${url}?lang=${lang}`;
}

export function getCurrentLangFromStorage(): "zh" | "en" | null {
  if (typeof localStorage === "undefined") return null;
  const v = localStorage.getItem("ea_lang");
  return v === "zh" || v === "en" ? v : null;
}

/** External workbench links need <a href>; same-origin can use router Link. */
export function isExternalWebAppUrl(): boolean {
  const base = resolveWebAppBase();
  return base.startsWith("http://") || base.startsWith("https://");
}
