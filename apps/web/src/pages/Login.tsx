import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  fetchBootstrapStatus,
  loginWithEmail,
  redeemBootstrap,
  redeemInvite,
  type BootstrapStatus,
} from "../api/auth";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { refreshOpsRole, setOpsRoleFromAuth } from "../lib/ops-role";
import SiteFooter from "../components/SiteFooter";

type LoginTab = "invite" | "email" | "bootstrap";

async function confirmSessionAndNavigate(
  me: { user_id: string; role: "admin" | "user"; display_name: string },
  navigate: ReturnType<typeof useNavigate>,
  returnTo: string,
  sessionError: string,
): Promise<void> {
  setOpsRoleFromAuth(me);
  const confirmed = await refreshOpsRole();
  if (!confirmed) {
    throw new Error(sessionError);
  }
  navigate(returnTo, { replace: true });
}

export default function Login() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  // 登录后默认入口：领域选择 /start。
  // 显式 state.from 保留（如 RequireAuth 把用户挡回原 ops 路径）。
  const returnTo = (location.state as { from?: string } | null)?.from ?? "/start";

  /** 公网重登主路径：邮箱；invite 仅 URL 带 token 时强制切 tab */
  const [tab, setTab] = useState<LoginTab>("email");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();

  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus | null>(null);
  const [inviteToken, setInviteToken] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteDisplayName, setInviteDisplayName] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [installCode, setInstallCode] = useState("");
  const [bootstrapEmail, setBootstrapEmail] = useState("");
  const [bootstrapPassword, setBootstrapPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  // 已有 session（例如从营销站「工作台」误入 /login）时直接进目标页，避免「又要登录」假象。
  useEffect(() => {
    if (!authLoading && user) {
      navigate(returnTo, { replace: true });
    }
  }, [authLoading, user, navigate, returnTo]);

  useEffect(() => {
    void fetchBootstrapStatus()
      .then(setBootstrapStatus)
      .catch(() => setBootstrapStatus(null));
    const inviteFromUrl = searchParams.get("invite");
    if (inviteFromUrl) {
      setInviteToken(inviteFromUrl);
      setTab("invite");
    }
  }, [searchParams]);

  const onInviteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const me = await redeemInvite({
        token: inviteToken.trim(),
        email: inviteEmail.trim(),
        password: invitePassword,
        display_name: inviteDisplayName.trim() || undefined,
      });
      await confirmSessionAndNavigate(me, navigate, returnTo, t("login.error.session"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const onEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const me = await loginWithEmail(email.trim(), password);
      await confirmSessionAndNavigate(me, navigate, returnTo, t("login.error.session"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const onBootstrapSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const me = await redeemBootstrap({
        install_code: installCode.trim(),
        email: bootstrapEmail.trim(),
        password: bootstrapPassword,
        display_name: displayName.trim() || undefined,
      });
      await confirmSessionAndNavigate(me, navigate, returnTo, t("login.error.session"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-wrap login-page">
        <section className="login-card">
          <p className="eyebrow">{t("login.eyebrow")}</p>
          <h1>{t("login.title")}</h1>
          <p className="lead">{t("login.lead")}</p>

          <div className="role-tabs" role="tablist" aria-label={t("login.tabs.aria")}>
            <button
              type="button"
              className={`role-tab${tab === "invite" ? " active" : ""}`}
              onClick={() => setTab("invite")}
            >
              {t("login.tab.invite")}
            </button>
            <button
              type="button"
              className={`role-tab${tab === "email" ? " active" : ""}`}
              onClick={() => setTab("email")}
            >
              {t("login.tab.email")}
            </button>
            {bootstrapStatus?.available === true && (
              <button
                type="button"
                className={`role-tab${tab === "bootstrap" ? " active" : ""}`}
                onClick={() => setTab("bootstrap")}
              >
                {t("login.tab.bootstrap")}
              </button>
            )}
          </div>

          {error && <p className="muted login-error">{error}</p>}

          {tab === "invite" && (
            <form className="login-panel" onSubmit={(e) => void onInviteSubmit(e)}>
              <p className="muted">{t("login.invite.lead")}</p>
              <label>
                {t("login.invite.input")}
                <input
                  value={inviteToken}
                  onChange={(e) => setInviteToken(e.target.value)}
                  required
                />
              </label>
              <label>
                {t("login.email.label")}
                <input
                  type="email"
                  autoComplete="username"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </label>
              <label>
                {t("login.password.label")}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  minLength={8}
                  required
                />
              </label>
              <label>
                {t("login.invite.displayName")}
                <input
                  value={inviteDisplayName}
                  onChange={(e) => setInviteDisplayName(e.target.value)}
                />
              </label>
              <button type="submit" className="btn btn-accent" disabled={loading}>
                {t("login.invite.submit")}
              </button>
            </form>
          )}

          {tab === "email" && (
            <form className="login-panel" onSubmit={(e) => void onEmailSubmit(e)}>
              <label>
                {t("login.email.label")}
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label>
                {t("login.password.label")}
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              <button type="submit" className="btn btn-accent" disabled={loading}>
                {t("login.email.submit")}
              </button>
            </form>
          )}

          {tab === "bootstrap" && (
            <form className="login-panel" onSubmit={(e) => void onBootstrapSubmit(e)}>
              <p className="muted">{t("login.bootstrap.lead")}</p>
              <label>
                {t("login.bootstrap.code")}
                <input
                  value={installCode}
                  onChange={(e) => setInstallCode(e.target.value)}
                  required
                />
              </label>
              <label>
                {t("login.email.label")}
                <input
                  type="email"
                  autoComplete="username"
                  value={bootstrapEmail}
                  onChange={(e) => setBootstrapEmail(e.target.value)}
                  required
                />
              </label>
              <label>
                {t("login.password.label")}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={bootstrapPassword}
                  onChange={(e) => setBootstrapPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </label>
              <label>
                {t("login.bootstrap.displayName")}
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </label>
              <button type="submit" className="btn btn-accent" disabled={loading}>
                {t("login.bootstrap.submit")}
              </button>
            </form>
          )}

          <p className="muted login-back">
            <Link to="/start">{t("login.backStart")}</Link>
          </p>
        </section>
      </div>
      <SiteFooter left={t("login.footer")} right="" />
    </>
  );
}
