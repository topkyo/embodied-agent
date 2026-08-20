/**
 * 工作台 → 营销站链接真源（与 apps/site `webAppUrl` / VITE_WEB_APP_URL 对称）。
 * - 生产：显式配置 `VITE_SITE_URL`（如 https://www.example.com）
 * - 本地 monorepo：site :5170 / web :5173；DEV 未配置时按当前 hostname 组营销站基址
 *   （真机经局域网 IP 访问时勿写死 127.0.0.1，否则品牌点击落到手机本机）
 */
function defaultDevSiteBase(): string {
  if (typeof window === "undefined") return "http://127.0.0.1:5170";
  const host = window.location.hostname;
  if (!host || host === "localhost" || host === "127.0.0.1") {
    return "http://127.0.0.1:5170";
  }
  return `http://${host}:5170`;
}

function resolveSiteBase(): string {
  const fromEnv = (import.meta.env.VITE_SITE_URL ?? "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) return defaultDevSiteBase();
  return "";
}

/** 跨域 URL 同步追加当前 lang，便于工作台/营销站之间切换语言后保持一致。 */
export function appendLangParam(url: string, lang: string | null): string {
  if (lang !== "zh" && lang !== "en") return url;
  return url.includes("?") ? `${url}&lang=${lang}` : `${url}?lang=${lang}`;
}

export function getCurrentLangFromStorage(): "zh" | "en" | null {
  if (typeof localStorage === "undefined") return null;
  const v = localStorage.getItem("ea_lang");
  return v === "zh" || v === "en" ? v : null;
}

/** 营销站绝对/相对 URL；空 base 时回落相对路径（同源反代部署）。 */
export function siteUrl(path = "/"): string {
  const siteBase = resolveSiteBase();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const lang = getCurrentLangFromStorage();
  if (!siteBase) return appendLangParam(normalizedPath === "/" ? "/" : normalizedPath, lang);
  if (normalizedPath === "/") return appendLangParam(`${siteBase}/`, lang);
  return appendLangParam(`${siteBase}${normalizedPath}`, lang);
}

export function isExternalSiteUrl(): boolean {
  const siteBase = resolveSiteBase();
  return siteBase.startsWith("http://") || siteBase.startsWith("https://");
}
