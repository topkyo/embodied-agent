import { useCallback, useEffect, useState } from "react";
import { UserPlus, Link as LinkIcon } from "lucide-react";
import {
  createWebAccount,
  issueInvite,
  listWebAccounts,
  setWebAccountPassword,
  type WebAccountSummary,
  type WebAuthRole,
} from "../../api/auth";
import { useLanguage } from "../../contexts/LanguageContext";
import { Banner } from "../../components/primitives/Banner";
import { PanelTitle } from "../../components/primitives/PanelTitle";

export function WebAccountPanel() {
  const { t } = useLanguage();
  const [accounts, setAccounts] = useState<WebAccountSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<WebAuthRole>("user");

  const [invite, setInvite] = useState<{ token: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);

  const [passwordTarget, setPasswordTarget] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordEmail, setPasswordEmail] = useState("");

  const reload = useCallback(async () => {
    try {
      const res = await listWebAccounts();
      setAccounts(res.accounts ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setErr(t("console.webaccounts.password.tooShort"));
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await createWebAccount({
        email: email.trim(),
        password,
        display_name: displayName.trim() || undefined,
        role,
      });
      setMsg(t("console.webaccounts.created", { email: email.trim() }));
      setEmail("");
      setPassword("");
      setDisplayName("");
      setRole("user");
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onIssueInvite() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const issued = await issueInvite("user");
      const link = `${window.location.origin}/login?invite=${issued.token}`;
      setInvite({ token: issued.token, link });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  async function copyUserId(userId: string) {
    try {
      await navigator.clipboard.writeText(userId);
      setCopiedUserId(userId);
      setTimeout(() => setCopiedUserId((cur) => (cur === userId ? null : cur)), 2000);
    } catch {
      // ignore
    }
  }

  async function onSetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordTarget) return;
    if (newPassword.length < 8) {
      setErr(t("console.webaccounts.password.tooShort"));
      return;
    }
    const target = accounts.find((a) => a.user_id === passwordTarget);
    const emailForLogin = passwordEmail.trim() || target?.email?.trim() || "";
    if (!emailForLogin) {
      setErr(t("console.webaccounts.password.emailRequired"));
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await setWebAccountPassword(
        passwordTarget,
        newPassword,
        target?.email ? undefined : emailForLogin,
      );
      setMsg(t("console.webaccounts.passwordUpdated", { user_id: passwordTarget }));
      setPasswordTarget(null);
      setNewPassword("");
      setPasswordEmail("");
      await reload();
    } catch (err) {
      setErr(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="webaccounts-config" className="settings-panel">
      <PanelTitle
        icon={<UserPlus size={20} aria-hidden />}
        title={t("sceneOps.users.webAccountsTitle")}
        text={t("sceneOps.users.webAccountsLead")}
      />
      {err && <Banner variant="error">{err}</Banner>}
      {msg && <Banner variant="ok">{msg}</Banner>}

      {accounts.length === 0 ? (
        <p className="muted">{t("console.webaccounts.empty")}</p>
      ) : (
        <table className="ops-table ops-data-table">
          <thead>
            <tr>
              <th>{t("console.webaccounts.col.name")}</th>
              <th>{t("console.webaccounts.col.role")}</th>
              <th>{t("console.webaccounts.col.email")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.user_id}>
                <td>
                  <div>{a.display_name}</div>
                  <div className="muted u-text-xs u-flex u-items-center u-gap-sm">
                    <span className="u-mono" title={t("console.webaccounts.col.id")}>
                      {a.user_id}
                    </span>
                    <button
                      type="button"
                      className="btn u-node-pick-btn"
                      title={t("console.webaccounts.btn.copyId")}
                      aria-label={t("console.webaccounts.btn.copyId")}
                      onClick={() => void copyUserId(a.user_id)}
                    >
                      {copiedUserId === a.user_id
                        ? t("console.webaccounts.invite.copied")
                        : t("console.webaccounts.invite.copy")}
                    </button>
                  </div>
                </td>
                <td>{a.role}</td>
                <td>{a.email ?? "—"}</td>
                <td>
                  {passwordTarget === a.user_id ? (
                    <form
                      onSubmit={(e) => void onSetPassword(e)}
                      className="form-grid form-grid-spaced"
                    >
                      {!a.email && (
                        <input
                          type="email"
                          value={passwordEmail}
                          onChange={(e) => setPasswordEmail(e.target.value)}
                          placeholder={t("console.webaccounts.col.email")}
                          required
                        />
                      )}
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t("console.webaccounts.password.set")}
                        minLength={8}
                        required
                      />
                      <button type="submit" className="btn" disabled={busy || !newPassword}>
                        {t("console.webaccounts.password.confirm")}
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => {
                        setPasswordTarget(a.user_id);
                        setPasswordEmail(a.email ?? "");
                        setNewPassword("");
                      }}
                    >
                      {t("console.webaccounts.btn.password")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form className="form-grid form-grid-spaced" onSubmit={(e) => void onCreate(e)}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("console.webaccounts.col.email")}
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("login.password.label")}
          minLength={8}
          required
        />
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={t("console.webaccounts.col.name")}
        />
        <select value={role} onChange={(e) => setRole(e.target.value as WebAuthRole)}>
          <option value="admin">admin</option>
          <option value="user">user</option>
        </select>
        <button type="submit" className="btn" disabled={busy || !email.trim() || !password}>
          {t("console.webaccounts.btn.create")}
        </button>
      </form>

      <div className="form-grid form-grid-spaced u-mt-field">
        <button
          type="button"
          className="btn btn-accent"
          disabled={busy}
          onClick={() => void onIssueInvite()}
        >
          {t("console.webaccounts.btn.invite")}
        </button>
      </div>

      {invite && (
        <div className="banner ok u-mt-field">
          <p>{t("console.webaccounts.invite.link")}</p>
          <p className="muted">
            <LinkIcon size={16} aria-hidden /> {invite.link}
          </p>
          <button type="button" className="btn" onClick={() => void copyLink()}>
            {copied ? t("console.webaccounts.invite.copied") : t("console.webaccounts.invite.copy")}
          </button>
        </div>
      )}
    </section>
  );
}
