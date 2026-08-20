import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { fetchPublicDomainPacks, type PublicDomainPackCatalogEntry } from "../api";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { resolvePackById, sceneOpsEntryPath, type LiveDomainPackMeta } from "../lib/domain-packs";
import { isAuthenticated } from "../lib/ops-role";
import { resolvePrincipalUserId } from "../lib/principal";
import WechatBind from "../components/WechatBind";
import { PlatformBind } from "../features/ops/PlatformBind";
import SiteFooter from "../components/SiteFooter";

type LiveCardMeta = {
  pack: LiveDomainPackMeta;
  runtime: PublicDomainPackCatalogEntry;
};

/**
 * /start 一体化页：
 *   - hero + pack picker：chip 列表，点选把当前 pack 写入 ?pack=
 *   - QR 主区：当前选中 pack 的 WechatBind / PlatformBind，QR + bind 流程均在内
 *   - CTA：进入 ops（仅 active_domain 上的 pack）；非 active_domain 时显 "回到 active_domain" 按钮
 *   - 平台底座 入口 由 ops 顶栏承担，本页不再直接给 admin 入口，避免双入口
 *   - QR 间 / 工作台间 切换都在一页内完成，不走 /start/wechat 中转。
 *
 * 兼容深链：`/start/wechat`（redirect 壳）会带原 search 跳到这里；query 参数解析与 StartWechat 行为一致。
 *
 * 注：本页**不**自带 chrome header —— WorkbenchLayout 外层 nav-platform 已承担 brand/lang；
 * role chip / 登录提示 改为 hero 内的副信息，避免双顶栏重复。
 */
export default function Start() {
  const { lang, t } = useLanguage();
  const overseas = lang === "en";
  const { loading: authLoading, isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const packHintSlug = searchParams.get("pack")?.trim() || undefined;
  const principalFromUrl = searchParams.get("principal")?.trim() || undefined;
  const noRedirect = searchParams.get("no_redirect") === "1";

  const [catalog, setCatalog] = useState<PublicDomainPackCatalogEntry[]>([]);
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * WeChat 绑定状态：进入 ops 的硬门槛。
   * Login → /start 后，admin/user 都必须完成 WeChat bind 才能显示「进入 ops」CTA。
   * WechatBind/PlatformBind 在 onConnected 时 setBindReady(true)。
   * 切 pack 后重置回 false，等新 pack 的 bind callback。
   */
  const [bindReady, setBindReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPublicDomainPacks()
      .then((p) => {
        if (cancelled) return;
        setCatalog(p.catalog);
        setActiveDomain(p.active_domain?.trim() || null);
      })
      .catch((e) => {
        if (cancelled) return;
        setCatalog([]);
        setActiveDomain(null);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const liveEntries: LiveCardMeta[] = useMemo(() => {
    const out: LiveCardMeta[] = [];
    for (const entry of catalog) {
      if (entry.status !== "live") continue;
      const pack = resolvePackById(entry.id);
      if (!pack || !pack.opsEnabled) continue;
      out.push({ pack: pack as LiveDomainPackMeta, runtime: entry });
    }
    return out;
  }, [catalog]);

  /**
   * 当前选中 pack：
   * - hint slug 命中 runtime-loadable 域 → 用其 packId（覆盖 active_domain）
   * - 否则 → active_domain 对应 runtime-loadable 域
   * - 仅一个可加载 pack 时默认选它；多个时默认 active_domain
   */
  const fallbackPackId = activeDomain ?? liveEntries[0]?.pack.packId;
  const currentMeta: LiveCardMeta | undefined = (() => {
    if (packHintSlug) {
      const m = liveEntries.find((e) => e.pack.slug === packHintSlug);
      if (m) return m;
    }
    if (fallbackPackId) {
      return liveEntries.find((e) => e.pack.packId === fallbackPackId);
    }
    return undefined;
  })();
  const currentPack = currentMeta?.pack;
  const currentRuntimeLive = Boolean(
    currentMeta?.runtime?.status === "live" && currentPack && activeDomain === currentPack.packId,
  );

  const switchPack = (slug: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("pack", slug);
    if (noRedirect) next.set("no_redirect", "1");
    else next.delete("no_redirect");
    setSearchParams(next, { replace: true });
    // 切 pack → 当前 pack 绑定状态未知，等新 WechatBind/PlatformBind onConnected 触发再放行
    setBindReady(false);
  };

  const principalParam = principalFromUrl ?? user?.user_id;
  const principalId = resolvePrincipalUserId(undefined, principalParam);
  const authReady = !authLoading;
  const roleLabel = isAdmin ? t("start.role.admin") : user ? t("start.role.user") : null;

  const targetOpsPath =
    currentPack && activeDomain === currentPack.packId ? sceneOpsEntryPath(currentPack) : null;
  const showEnterOpsCta =
    Boolean(targetOpsPath) && !noRedirect && authReady && isAuthenticated() && bindReady;

  const banner = currentPack
    ? t("start.packPreview", {
        scene: t(currentPack.displayNameKey),
        active: currentRuntimeLive ? t("start.banner.activeShort") : t("start.banner.inactiveTag"),
      })
    : null;

  return (
    <>
      <div className="page-wrap login-page start-page start-single">
        <section className="start-hero">
          <p className="eyebrow">
            {t("start.eyebrow")}
            {roleLabel && (
              <span className="ops-role-chip" data-role={isAdmin ? "admin" : "user"}>
                {roleLabel}
              </span>
            )}
          </p>
          <h1>{t("start.title")}</h1>
          <p className="lead">{t("start.lead")}</p>
          <p className="muted start-subtitle">{t("start.subtitle")}</p>

          {loading && <p className="muted">{t("common.loading")}</p>}
          {!loading && error && (
            <p className="muted start-banner-error">{t("start.banner.error")}</p>
          )}
          {!loading && !error && banner && <p className="muted start-banner-active">{banner}</p>}

          {authReady && !user && (
            <p className="muted start-anon-hint">
              {t("start.unauthorized")}{" "}
              <Link className="link-accent-sm" to="/login" state={{ from: "/start" }}>
                {t("start.signIn")}
              </Link>
            </p>
          )}
          {authReady && user && !isAdmin && (
            <p className="muted start-anon-hint">
              {t("start.role.user")}: {user.display_name}
            </p>
          )}
        </section>

        <section className="start-picker" aria-label={t("wechat.scene.pickerAria")}>
          <p className="eyebrow start-picker-label">{t("wechat.scene.pickerLabel")}</p>
          <div className="start-picker-row" data-testid="start-picker-row">
            {liveEntries.map((entry) => {
              const isCurrent = currentPack && entry.pack.slug === currentPack.slug;
              const isActiveRuntime = entry.pack.packId === activeDomain;
              return (
                <button
                  key={entry.pack.slug}
                  type="button"
                  className={`start-picker-chip${isCurrent ? " is-current" : ""}${isActiveRuntime ? " is-active-runtime" : ""}`}
                  onClick={() => switchPack(entry.pack.slug)}
                  aria-pressed={isCurrent}
                  data-pack={entry.pack.slug}
                  data-current={isCurrent ? "1" : "0"}
                  data-active-runtime={isActiveRuntime ? "1" : "0"}
                >
                  <span className="start-picker-name">{t(entry.pack.displayNameKey)}</span>
                  {isActiveRuntime && (
                    <span className="start-picker-tag">{t("start.banner.activeShort")}</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="start-qr-area" aria-label={t("start.qrLabel")}>
          {!currentPack && !loading && <p className="muted">{t("start.emptyScene")}</p>}
          {authReady && !user && (
            <p className="muted">
              {t("wechat.principal.loginFirst")}{" "}
              <Link
                to="/login"
                state={{
                  from: `/start${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
                }}
              >
                {t("wechat.adminLoginLink")}
              </Link>
            </p>
          )}
          {currentPack &&
            authReady &&
            user &&
            principalId &&
            (overseas ? (
              <PlatformBind
                compact
                principalUserId={principalId}
                onConnected={(info) => {
                  /**
                   * Bind 放行规则：
                   *   source="status"   → 服务端/缓存 已认定 principal 绑定过（一次性绑过皆可）；
                   *   source="confirm"  → 本次扫码确认（双保险，刚扫即入）。
                   * 任一 都 → setBindReady(true)；只有 没绑过且 本次也未扫 才不进 ops。
                   */
                  if (info.source === "status" || info.source === "confirm") {
                    setBindReady(true);
                    if (info.source === "confirm" && !noRedirect && targetOpsPath) {
                      navigate(targetOpsPath, { replace: true });
                    }
                  }
                }}
              />
            ) : (
              <WechatBind
                key={`${currentPack.packId}:${principalId}`}
                compact
                autoStart
                sceneLabel={t(currentPack.displayNameKey)}
                domainPackId={currentPack.packId}
                principalUserId={principalId}
                onConnected={(info) => {
                  if (info.source === "status" || info.source === "confirm") {
                    setBindReady(true);
                    if (info.source === "confirm" && !noRedirect && targetOpsPath) {
                      navigate(targetOpsPath, { replace: true });
                    }
                  }
                }}
              />
            ))}
        </section>

        {currentPack && (
          <section className="start-actions" aria-label={t("start.actionsLabel")}>
            {showEnterOpsCta && targetOpsPath && (
              <Link className="btn btn-accent" to={targetOpsPath}>
                {t("wechat.enterOps", { scene: t(currentPack.displayNameKey) })}
              </Link>
            )}
            {currentPack &&
              authReady &&
              user &&
              !showEnterOpsCta &&
              currentRuntimeLive === false && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => switchPack(activeDomain ?? liveEntries[0]?.pack.slug ?? "")}
                >
                  {t("start.actions.backToActive")}
                </button>
              )}
            {!authReady && <span className="muted">{t("common.loading")}</span>}
          </section>
        )}
      </div>
      <SiteFooter left={t("brand")} right="" />
    </>
  );
}
