import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import { RadioTower } from "lucide-react";
import { bindAdminNode, listAdminNodes, pairAdminNode, type AdminNode } from "../api";
import { Banner } from "../components/primitives/Banner";
import { useLanguage } from "../contexts/LanguageContext";
import { useDomainPack, useOpsSchema } from "../contexts/DomainPackContext";
import { useAuth } from "../contexts/AuthContext";
import { devicesTemplateForNode, registerDeviceTemplateForPack } from "../nodeBinding";
import AdminOnlyShell from "./scene-ops/AdminOnlyShell";

export default function Pair() {
  const { t } = useLanguage();
  const pack = useDomainPack();
  const opsSchema = useOpsSchema();
  const { isAdmin } = useAuth();
  const deviceTemplate = opsSchema?.devices.binding.deviceTemplate;
  const { packSlug } = useParams();
  const [params] = useSearchParams();
  const currentPackSlug = packSlug?.trim() ?? "";
  const nodeIdFromUrl = params.get("node_id")?.trim() ?? "";
  const [nodeIdInput, setNodeIdInput] = useState(nodeIdFromUrl);
  const [deploymentId, setDeploymentId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<AdminNode[]>([]);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    registerDeviceTemplateForPack(pack.packId, deviceTemplate);
  }, [pack.packId, deviceTemplate]);

  useEffect(() => {
    if (nodeIdFromUrl) setNodeIdInput(nodeIdFromUrl);
  }, [nodeIdFromUrl]);

  const nodeId = nodeIdInput.trim();

  const pairPageUrl =
    typeof window !== "undefined" && currentPackSlug && nodeId
      ? `${window.location.origin}/scenes/${encodeURIComponent(currentPackSlug)}/ops/devices/pair?node_id=${encodeURIComponent(nodeId)}`
      : "";
  const devicesPath = currentPackSlug ? `/scenes/${currentPackSlug}/ops/devices` : "/scenes";
  // 同一帧渲染直接从 opsSchema 派生，避免首帧 effect 未跑时短暂 false。
  const supportsPairing = Boolean(deviceTemplate?.length);

  useEffect(() => {
    if (!pairPageUrl) {
      setQrUrl(null);
      return;
    }
    void QRCode.toDataURL(pairPageUrl, { width: 200, margin: 2 }).then(setQrUrl);
  }, [pairPageUrl]);

  const reload = useCallback(async () => {
    try {
      const n = await listAdminNodes("pending");
      setPending(n.nodes || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => void reload(), 5000);
    return () => window.clearInterval(id);
  }, [reload]);

  const nodePending = pending.find((n) => n.node_id === nodeId);

  useEffect(() => {
    if (!nodePending) return;
    if (nodePending.deployment_id) setDeploymentId(nodePending.deployment_id);
    if (nodePending.entity_id) setEntityId(nodePending.entity_id);
  }, [nodePending?.node_id, nodePending?.deployment_id, nodePending?.entity_id]);

  async function doPair() {
    if (!supportsPairing) {
      setErr(t("console.devices.unsupportedPack"));
      return;
    }
    if (!nodeId) {
      setErr(t("pair.missingNodeId"));
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await pairAdminNode(nodeId, deploymentId, entityId || undefined, 30);
      setMsg(
        res.mqtt_published
          ? t("pair.mqttOk", { code: res.install_code })
          : t("pair.mqttFail", { code: res.install_code }),
      );
      void reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doBind() {
    if (!supportsPairing) {
      setErr(t("console.devices.unsupportedPack"));
      return;
    }
    if (!nodeId) return;
    setBusy(true);
    setErr(null);
    try {
      const devices = devicesTemplateForNode(nodeId, pack.packId);
      const res = await bindAdminNode(nodeId, {
        deployment_id: deploymentId,
        entity_id: entityId || undefined,
        devices,
      });
      setMsg(
        t("pair.bindSuccess", {
          node_id: res.node.node_id,
          cv: String(res.node.config_version),
        }),
      );
      void reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <AdminOnlyShell eyebrowKey="console.devices.panelTitle" bodyKey="sceneOps.adminOnly.pair" />
    );
  }

  return (
    <section className="settings-page">
      <div className="settings-shell pair-shell">
        <header className="pair-header">
          <h1 className="pair-title">
            <RadioTower size={22} aria-hidden />
            {t("pair.title")}
          </h1>
          <p className="muted pair-lead">{t("pair.lead")}</p>
          <Link to={devicesPath} className="pair-back-link">
            {t("pair.backDevices")}
          </Link>
        </header>

        {err && <Banner variant="error">{err}</Banner>}
        {msg && <Banner variant="ok">{msg}</Banner>}
        {!supportsPairing && (
          <Banner variant="error">{t("console.devices.unsupportedPack")}</Banner>
        )}

        <div className="settings-panel">
          <label className="u-text-sm u-block u-mb-xs">{t("pair.nodeIdLabel")}</label>
          <input
            value={nodeIdInput}
            onChange={(e) => setNodeIdInput(e.target.value)}
            readOnly={Boolean(nodeIdFromUrl)}
            placeholder={t("pair.nodeIdPlaceholder")}
            className={`pair-field-full${nodeId ? "" : " is-empty"}`}
          />

          <div className="u-flex u-gap-sm u-mb-md u-flex-wrap">
            <input
              value={deploymentId}
              onChange={(e) => setDeploymentId(e.target.value)}
              placeholder="deployment_id"
              className="u-w-120"
            />
            <input
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder="entity_id"
              className="u-w-140"
            />
          </div>

          <div className="u-flex u-gap-sm u-flex-wrap u-mb-md">
            <button
              type="button"
              className="btn primary"
              disabled={busy || !nodeId}
              onClick={doPair}
            >
              {busy ? t("pair.busy") : t("pair.generateAndSend")}
            </button>
            {nodePending && (
              <button type="button" className="btn" disabled={busy} onClick={doBind}>
                {t("pair.confirmBind")}
              </button>
            )}
          </div>

          <div className="u-text-sm">
            {t("pair.statusLabel")}
            {!nodeId && t("pair.statusWaitScan")}
            {nodeId && !nodePending && t("pair.statusNotPending")}
            {nodePending && t("pair.statusPending", { fw: nodePending.firmware_version ?? "" })}
          </div>

          {qrUrl && nodeId && (
            <div className="u-mt-md u-text-xs u-opacity-75">
              <div>{t("pair.qrLinkHint")}</div>
              <img src={qrUrl} alt={t("pair.qrAlt")} width={200} height={200} className="u-mt-sm" />
              <div className="u-break-all u-mt-xs">{pairPageUrl}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
