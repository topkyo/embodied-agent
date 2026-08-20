import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import {
  claimBindingCode,
  issueBindingCode,
  listBindings,
  manualBind,
  type Binding,
} from "../../api";
import { useLanguage } from "../../contexts/LanguageContext";
import { resolvePrincipalUserId } from "../../lib/principal";
import { Banner } from "../../components/primitives/Banner";

type PlatformBindProps = {
  compact?: boolean;
  principalUserId?: string;
  onConnected?: (info: { source: "status" | "confirm" }) => void;
};

export function PlatformBind({ compact = false, principalUserId, onConnected }: PlatformBindProps) {
  const { t } = useLanguage();
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [expires, setExpires] = useState<string | null>(null);
  const [platform, setPlatform] = useState("whatsapp");
  const [userId, setUserId] = useState("");
  const principalId = resolvePrincipalUserId(undefined, principalUserId);
  const [busy, setBusy] = useState(false);
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [rebinding, setRebinding] = useState(false);

  const whatsappBound = Boolean(
    principalId &&
    bindings.some((b) => b.platform === "whatsapp" && b.principal_user_id === principalId),
  );
  const showBindFlow = !whatsappBound || rebinding;

  const reload = async () => {
    try {
      const res = await listBindings();
      setBindings(res.bindings || []);
    } catch (e: unknown) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (whatsappBound) onConnected?.({ source: "status" });
  }, [whatsappBound, onConnected]);

  async function issue() {
    setBusy(true);
    setLocalErr(null);
    setLocalMsg(null);
    if (!principalId) {
      setLocalErr(t("wechat.principal.required"));
      setBusy(false);
      return;
    }
    setRebinding(true);
    try {
      const res = await issueBindingCode(principalId, 30);
      if (res.ok) {
        setCode(res.code);
        setExpires(res.expires_at);
        void track("binding_code_issued", { platform });
      }
    } catch (e: unknown) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doClaim() {
    if (!code || !userId.trim()) return;
    setBusy(true);
    setLocalErr(null);
    try {
      await claimBindingCode(code, platform, userId.trim());
      setLocalMsg(t("bind.success"));
      setCode(null);
      setUserId("");
      setRebinding(false);
      void reload();
      void track("binding_completed", { platform });
      onConnected?.({ source: "confirm" });
    } catch (e: unknown) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doManual() {
    if (!userId.trim()) return;
    setBusy(true);
    setLocalErr(null);
    if (!principalId) {
      setLocalErr(t("wechat.principal.required"));
      setBusy(false);
      return;
    }
    try {
      await manualBind(platform, userId.trim(), principalId);
      setLocalMsg(t("bind.success"));
      setUserId("");
      setRebinding(false);
      void reload();
      onConnected?.({ source: "confirm" });
    } catch (e: unknown) {
      setLocalErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`platform-bind${compact ? " platform-bind--compact" : ""}`}>
      {!compact && <h2>{t("settings.integration.whatsapp.title")}</h2>}
      <p className="muted">
        {compact
          ? t("settings.integration.whatsapp.descCompact")
          : t("settings.integration.whatsapp.desc")}
      </p>
      {showBindFlow && (
        <p className="muted platform-bind-instructions">
          {t("settings.integration.whatsapp.instructions")}
        </p>
      )}

      {localErr && <Banner variant="error">{localErr}</Banner>}
      {localMsg && <Banner variant="ok">{localMsg}</Banner>}

      {whatsappBound && !rebinding && (
        <p className="wechat-connected">
          <span className="pill pill--ok">{t("settings.integration.whatsapp.connected")}</span>
        </p>
      )}

      {showBindFlow && (
        <>
          <div className="platform-bind-issue">
            <button type="button" className="btn" disabled={busy} onClick={issue}>
              {busy ? t("bind.code.generating") : t("bind.code.generate")}
            </button>
          </div>

          {code && (
            <div className="qr-wrap platform-bind-code">
              <div className="platform-bind-code-value">{code}</div>
              <div className="muted platform-bind-code-expires">
                {t("bind.code.expires")}: {new Date(expires!).toLocaleString()}
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  void navigator.clipboard?.writeText(code);
                }}
              >
                {t("bind.code.copy")}
              </button>
            </div>
          )}

          {!compact && (
            <div className="platform-bind-manual">
              <div className="platform-bind-manual-title">{t("bind.code.manual.title")}</div>
              <div className="muted platform-bind-manual-desc">{t("bind.code.manual.desc")}</div>

              <div className="form-grid platform-bind-manual-grid">
                <label>
                  {t("bind.code.manual.platform")}
                  <input value={platform} onChange={(e) => setPlatform(e.target.value)} />
                </label>
                <label>
                  {t("bind.code.manual.userid")}
                  <input
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="+1xxxxxxxx"
                  />
                </label>
              </div>

              <div className="platform-bind-manual-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !userId.trim()}
                  onClick={code ? doClaim : doManual}
                >
                  {busy ? t("bind.code.manual.binding") : t("bind.code.manual.btn")}
                </button>
                <button type="button" className="btn btn-ghost" onClick={reload}>
                  {t("bind.list.refresh")}
                </button>
              </div>
            </div>
          )}

          {compact && code && (
            <div className="platform-bind-compact-claim">
              <label className="platform-bind-compact-label">
                {t("bind.code.manual.userid")}
                <input
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="+1xxxxxxxx"
                />
              </label>
              <button
                type="button"
                className="btn"
                disabled={busy || !userId.trim()}
                onClick={doClaim}
              >
                {busy ? t("bind.code.manual.binding") : t("bind.code.manual.btn")}
              </button>
            </div>
          )}
        </>
      )}

      {whatsappBound && (
        <div className="wechat-actions">
          <button
            type="button"
            className={`btn${compact ? " btn-ghost" : ""}`}
            disabled={busy}
            onClick={() => {
              setRebinding(true);
              setCode(null);
              setLocalMsg(null);
              void issue();
            }}
          >
            {t("settings.integration.whatsapp.rebind")}
          </button>
        </div>
      )}

      {!compact && principalId && bindings.length > 0 && (
        <div className="platform-bind-list">
          <div className="platform-bind-list-title">{t("bind.list.title")}</div>
          <ul>
            {bindings
              .filter((b) => b.principal_user_id === principalId)
              .map((b) => (
                <li key={`${b.platform}-${b.platform_user_id}`}>
                  {b.platform} — {b.platform_user_id} → {b.principal_user_id}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
