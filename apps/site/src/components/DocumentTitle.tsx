import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useLanguage } from "../contexts/LanguageContext";

function titleSuffix(pathname: string, t: (key: string) => string): string {
  if (pathname === "/") return t("nav.platform");
  if (pathname.includes("/ops/devices/pair")) return t("pair.title");
  if (pathname.includes("/ops/devices")) return t("sceneOps.nav.devices");
  if (pathname.includes("/ops/settings")) return t("sceneOps.nav.settings");
  if (pathname.includes("/ops/users")) return t("sceneOps.nav.users");
  if (pathname.includes("/ops/review")) return t("sceneOps.nav.review");
  if (pathname.includes("/ops/platform")) return t("sceneOps.nav.platform");
  if (pathname.includes("/ops")) return t("sceneOps.nav.overview");
  if (pathname.startsWith("/scenes/greenhouse")) return t("nav.farm");
  if (pathname.startsWith("/scenes/robot")) return t("scenes.robot.title");
  if (pathname.startsWith("/scenes/aquaculture")) return t("scenes.aquaculture.title");
  if (pathname.startsWith("/scenes/coldchain")) return t("scenes.coldchain.title");
  if (pathname.startsWith("/scenes/industrial")) return t("scenes.industrial.title");
  if (pathname.startsWith("/scenes/elderly")) return t("scenes.elderly.title");
  if (pathname.startsWith("/scenes/pet")) return t("scenes.pet.title");
  if (pathname.startsWith("/scenes")) return t("nav.scenes");
  if (pathname.startsWith("/nodes")) return t("nav.hardware");
  if (pathname.startsWith("/start/wechat")) return t("nav.wechat");
  if (pathname === "/design-lab") return t("nav.designLab");
  return t("nav.platform");
}

export default function DocumentTitle() {
  const { pathname } = useLocation();
  const { t } = useLanguage();

  useEffect(() => {
    document.title = `${t("brand")} · ${titleSuffix(pathname, t)}`;
  }, [pathname, t]);

  return null;
}
