import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";

/** 工作台路由标题；不含营销站路径（/nodes、概念场景等在 apps/site）。 */
function titleSuffix(pathname: string, t: (key: string) => string): string {
  if (pathname === "/login") return t("login.title");
  if (pathname.startsWith("/start/wechat")) return t("nav.wechat");
  if (pathname.startsWith("/start")) return t("nav.start");
  if (pathname.includes("/ops/devices/pair")) return t("pair.title");
  if (pathname.includes("/ops/devices")) return t("sceneOps.nav.devices");
  if (pathname.includes("/ops/settings")) return t("sceneOps.nav.settings");
  if (pathname.includes("/ops/users")) return t("sceneOps.nav.users");
  if (pathname.includes("/ops/review")) return t("sceneOps.nav.review");
  if (pathname.includes("/ops/platform")) return t("sceneOps.nav.platform");
  if (pathname.includes("/ops/control")) return t("sceneOps.nav.control");
  if (pathname.includes("/ops")) return t("sceneOps.nav.overview");
  return t("nav.workbench");
}

export default function DocumentTitle() {
  const { pathname } = useLocation();
  const { t } = useLanguage();

  useEffect(() => {
    document.title = `${t("brand")} · ${titleSuffix(pathname, t)}`;
  }, [pathname, t]);

  return null;
}
