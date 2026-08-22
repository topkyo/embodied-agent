import { Outlet, NavLink, useLocation } from "react-router-dom";
import { MarketingNavProvider, useMarketingNav } from "../contexts/MarketingNavContext";
import { useLanguage } from "../contexts/LanguageContext";
import LangSwitcher from "../components/LangSwitcher";
import { webAppUrl } from "../lib/web-app-url";

function NavLabel({ fullKey, shortKey }: { fullKey: string; shortKey: string }) {
  const { t } = useLanguage();
  return (
    <>
      <span className="nav-label nav-label--full">{t(fullKey)}</span>
      <span className="nav-label nav-label--short">{t(shortKey)}</span>
    </>
  );
}

function MarketingLayoutInner() {
  const { t } = useLanguage();
  const { theme } = useMarketingNav();
  const { pathname } = useLocation();
  const flush = pathname === "/";
  const wechatHref = webAppUrl("/start");

  return (
    <div className={`marketing-shell${flush ? " marketing-shell--flush" : ""}`}>
      <a href="#main" className="skip-link">
        {t("a11y.skipToMain")}
      </a>
      <header className={`nav-platform on-${theme}`}>
        <NavLink to="/" end className="brand" aria-label={t("brand")}>
          <span className="brand-mark" aria-hidden>
            EA
          </span>
          <span className="brand-text">{t("brand")}</span>
        </NavLink>
        <div className="nav-end">
          <nav className="nav-links nav-links--segments" aria-label={t("a11y.primaryNav")}>
            <NavLink to="/" end>
              <NavLabel fullKey="nav.platform" shortKey="nav.platform.short" />
            </NavLink>
            <NavLink to="/nodes">
              <NavLabel fullKey="nav.hardware" shortKey="nav.hardware.short" />
            </NavLink>
            <NavLink to="/scenes">
              <NavLabel fullKey="nav.scenes" shortKey="nav.scenes.short" />
            </NavLink>
          </nav>
          <div className="nav-end-actions">
            <a href={wechatHref} className="nav-cta-wechat">
              {t("nav.wechat")}
            </a>
            <LangSwitcher className="lang-switcher--nav" />
            <a href={webAppUrl("/start")} className="nav-ops">
              <NavLabel fullKey="nav.workbench" shortKey="nav.workbench.short" />
            </a>
          </div>
        </div>
      </header>
      <main id="main" className="marketing-main">
        <Outlet />
      </main>
    </div>
  );
}

export default function MarketingLayout() {
  const { pathname } = useLocation();
  const initialTheme = pathname === "/" || pathname === "/nodes" ? "dark" : "light";

  return (
    <MarketingNavProvider initialTheme={initialTheme}>
      <MarketingLayoutInner />
    </MarketingNavProvider>
  );
}
