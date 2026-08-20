import { Link, Outlet, useLocation } from "react-router-dom";
import LangSwitcher from "../components/LangSwitcher";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { siteUrl } from "../lib/site-url";
// nav-platform / nav-end / lang-switcher--nav 真源；缺则 display:block，语言会掉到品牌下方
import "../design/marketing.css";

/**
 * 工作台页 chrome（/login、/start、/scenes/:packSlug/ops/*）。
 * 品牌链到营销站首页（VITE_SITE_URL），与 site「工作台 → VITE_WEB_APP_URL」对称。
 *
 * 内嵌 AuthProvider：让 /start 等页面可以调用 useAuth() 取 session；
 * `/scenes/:packSlug/ops/*` 路由自带 AuthProvider，React Context 嵌套不冲突，
 * 两层共享 `lib/ops-role` 模块缓存（refreshOpsRole in-flight 去重）。
 *
 * 未登录 user → 顶栏右侧 出现 「登录」 链接，state.from = current pathname+search；
 * 是匿名访问 admin-only ops/平台底座 的主要入口（不再依赖 body 侧的拒绝壳）。
 */
export default function WorkbenchLayout() {
  return (
    <AuthProvider>
      <WorkbenchShell />
    </AuthProvider>
  );
}

function WorkbenchShell() {
  const { t } = useLanguage();
  const productHome = siteUrl("/");
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const currentPath = `${location.pathname}${location.search || ""}`;

  return (
    <div className="marketing-shell">
      <header className="nav-platform on-light">
        <a href={productHome} className="brand" aria-label={t("nav.productSiteHome")}>
          <span className="brand-mark" aria-hidden>
            EA
          </span>
          <span>{t("brand")}</span>
        </a>
        <div className="nav-end">
          <LangSwitcher className="lang-switcher--nav" />
          {!authLoading && !user && (
            <Link
              to="/login"
              state={{ from: currentPath }}
              className="link-accent-sm nav-end-signin"
              data-testid="workbench-topbar-signin"
            >
              {t("login.topbarSignIn")}
            </Link>
          )}
        </div>
      </header>
      <main className="marketing-main">
        <Outlet />
      </main>
    </div>
  );
}
