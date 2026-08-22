import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { track } from "@vercel/analytics";
import {
  AdminFetchError,
  fetchWechatStatus,
  pollWechatLogin,
  startWechatLogin,
  type WechatLoginView,
  type WechatStatus,
} from "../api";
import { useLanguage } from "../contexts/LanguageContext";
import { resolvePrincipalUserId } from "../lib/principal";
import { Banner } from "./primitives/Banner";

export type WechatBindConnectedInfo = {
  /** status=已绑定态拉取；confirm=本页扫码/重绑确认成功 */
  source: "status" | "confirm";
};

type WechatBindProps = {
  compact?: boolean;
  sceneLabel?: string;
  /** 工程 packId，写入登录会话供追溯 */
  domainPackId?: string;
  principalUserId?: string;
  autoStart?: boolean;
  onConnected?: (info: WechatBindConnectedInfo) => void;
};

function formatWechatApiError(e: unknown, t: (key: string) => string): string {
  if (e instanceof AdminFetchError) {
    const msg = typeof e.body.message === "string" ? e.body.message : e.message;
    if (e.status === 503 && msg) return msg;
    if (e.status >= 500 || e.status === 0) {
      return t("wechat.error.apiDown");
    }
    return msg;
  }
  if (e instanceof TypeError && /fetch|network/i.test(e.message)) {
    return t("wechat.error.apiDown");
  }
  return e instanceof Error ? e.message : String(e);
}

export default function WechatBind({
  compact = false,
  sceneLabel,
  domainPackId,
  principalUserId,
  autoStart = false,
  onConnected,
}: WechatBindProps) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<WechatStatus | null>(null);
  const [login, setLogin] = useState<WechatLoginView | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rebinding, setRebinding] = useState(false);
  const autoStartAttemptedRef = useRef(false);
  const principalId = resolvePrincipalUserId(undefined, principalUserId);

  const connected = Boolean(
    principalId && status?.connected && status.account?.principal_user_id === principalId,
  );
  const showQr = Boolean(qrDataUrl && login?.status !== "confirmed" && (!connected || rebinding));

  const reloadStatus = useCallback(async () => {
    try {
      setStatus(await fetchWechatStatus());
    } catch (e) {
      if (e instanceof AdminFetchError && e.status === 401) {
        setError(t("wechat.error.unauthorized"));
        return;
      }
      setError(formatWechatApiError(e, t));
    }
  }, [t]);

  const onStart = useCallback(
    async (force = false) => {
      setBusy(true);
      setError(null);
      if (!principalId) {
        setError(t("wechat.principal.required"));
        setBusy(false);
        return;
      }
      if (force) setRebinding(true);
      try {
        const next = await startWechatLogin({
          principal_user_id: principalId,
          domain: domainPackId,
          force,
        });
        setLogin(next);
        if (!next.qrcode_content && next.status === "expired") {
          setError(next.message || t("wechat.error.apiDown"));
        }
        void track("wechat_bind_initiated", {
          force: !!force,
          already_connected: !!status?.connected,
          domain: domainPackId ?? "",
        });
      } catch (e) {
        setError(formatWechatApiError(e, t));
      } finally {
        setBusy(false);
      }
    },
    [principalId, domainPackId, status?.connected, t],
  );

  useEffect(() => {
    autoStartAttemptedRef.current = false;
    setLogin(null);
    setQrDataUrl(null);
    setError(null);
  }, [domainPackId]);

  // Parent often resolves principal after session refresh; allow autoStart to retry.
  useEffect(() => {
    if (principalId) {
      autoStartAttemptedRef.current = false;
    }
  }, [principalId]);

  useEffect(() => {
    void reloadStatus();
  }, [reloadStatus]);

  useEffect(() => {
    if (status?.connected) onConnected?.({ source: "status" });
  }, [status?.connected, onConnected]);

  useEffect(() => {
    if (!autoStart || autoStartAttemptedRef.current) return;
    // Wait for principal (e.g. session user_id) — do not sticky-error; that blocked later autoStart.
    if (!principalId) return;
    if (busy || login?.qrcode_content) return;
    if (status?.connected) return;
    if (login?.status === "expired") return;
    autoStartAttemptedRef.current = true;
    void onStart(false);
  }, [
    autoStart,
    busy,
    login?.qrcode_content,
    login?.status,
    onStart,
    principalId,
    status?.connected,
  ]);

  useEffect(() => {
    if (!login?.qrcode_content) {
      setQrDataUrl(null);
      return;
    }
    void QRCode.toDataURL(login.qrcode_content, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: "M",
    }).then(setQrDataUrl);
  }, [login?.qrcode_content]);

  useEffect(() => {
    if (!login?.session_key) return;
    if (login.status === "confirmed" || login.status === "idle") return;
    const id = window.setInterval(() => {
      void pollWechatLogin(login.session_key)
        .then((next) => {
          setLogin(next);
          if (next.connected) {
            setRebinding(false);
            void reloadStatus();
            void track("wechat_bind_confirmed", {
              principal_user_id: next.principal_user_id,
            });
            onConnected?.({ source: "confirm" });
          }
        })
        .catch((e) => setError(formatWechatApiError(e, t)));
    }, 2000);
    return () => window.clearInterval(id);
  }, [login?.session_key, login?.status, onConnected, reloadStatus, t]);

  useEffect(() => {
    if (connected && !rebinding) {
      setLogin(null);
      setQrDataUrl(null);
    }
  }, [connected, rebinding]);

  return (
    <section className={`wechat-bind${compact ? " wechat-bind--compact" : ""}`}>
      {!compact && <h2>{t("settings.integration.wechat.title")}</h2>}
      {!compact && (
        <p className="muted">
          {sceneLabel
            ? `${t("settings.integration.wechat.desc")} (${sceneLabel})`
            : t("settings.integration.wechat.desc")}
        </p>
      )}
      {compact && sceneLabel && <p className="muted wechat-bind-scene">{sceneLabel}</p>}
      {error && <Banner variant="error">{error}</Banner>}

      {connected &&
        (compact ? (
          <div className="wechat-connected">
            <span className="pill pill--ok">{t("settings.integration.wechat.connected")}</span>
            {!status!.bridge_running && (
              <span className="pill pill--warn">
                {t("settings.integration.wechat.bridge.stopped")}
              </span>
            )}
          </div>
        ) : (
          <div className="status-row">
            <span className="pill pill--ok">{t("settings.integration.wechat.connected")}</span>
            <span className="pill">
              {status!.bridge_running
                ? t("settings.integration.wechat.bridge.running")
                : t("settings.integration.wechat.bridge.stopped")}
            </span>
            <span className="pill">
              {t("settings.integration.wechat.farm", {
                id: status!.account!.principal_user_id ?? "—",
              })}
            </span>
          </div>
        ))}

      {login?.message && !error && !connected && <Banner variant="ok">{login.message}</Banner>}

      {showQr && (
        <div className="qr-wrap">
          <img
            src={qrDataUrl!}
            alt={t("settings.integration.wechat.qr.alt")}
            width={240}
            height={240}
          />
          <p className="muted qr-hint">
            {login?.status === "scaned"
              ? t("settings.integration.wechat.hint.scanned")
              : t("settings.integration.wechat.hint.default")}
          </p>
        </div>
      )}

      {(!compact || connected || error || rebinding) && (
        <div className="wechat-actions">
          <button
            type="button"
            className={`btn${compact ? " btn-ghost" : ""}`}
            disabled={busy}
            onClick={() => {
              autoStartAttemptedRef.current = false;
              void onStart(connected);
            }}
          >
            {busy
              ? t("settings.integration.wechat.btn.generating")
              : connected
                ? t("settings.integration.wechat.btn.regenerate")
                : t("settings.integration.wechat.btn.generate")}
          </button>
        </div>
      )}
    </section>
  );
}
