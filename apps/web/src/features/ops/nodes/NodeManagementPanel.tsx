import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  bindAdminNode,
  issueNodeInstallCode,
  listAdminNodes,
  listNodeInstallCodes,
  pairAdminNode,
  type AdminNode,
  type BindNodeDevice,
  type NodeInstallCode,
} from "../../../api";
import { useAuth } from "../../../contexts/AuthContext";
import { useLanguage } from "../../../contexts/LanguageContext";
import { useDomainPack, useOpsSchema } from "../../../contexts/DomainPackContext";
import { useInterval } from "../../../hooks/useInterval";
import { registerDeviceTemplateForPack } from "../../../nodeBinding";
import { Banner } from "../../../components/primitives/Banner";
import { ActiveNodesPanel } from "./ActiveNodesPanel";
import { AdminBindPanel } from "./AdminBindPanel";
import { InstallCodePanel } from "./InstallCodePanel";
import { PendingNodesPanel } from "./PendingNodesPanel";
import { pendingMatchesEntity, selectPendingNode, type NodeSelectMode } from "./selectPendingNode";

const NODES_POLL_MS = 10_000;

export type { RelativeAge } from "./format";
export { formatNodeEntityLabel, formatNodeTechTitle, relativeAgeFromIso } from "./format";

/**
 * 绑定流阶段（显式状态，替代 userPickedNodeRef + lastAutoSelectedRef）。
 * - idle: 初始 / 绑定完成重置
 * - selecting: 可自动或手动选 pending 节点（selectMode 区分来源）
 * - binding: 提交 bind 中
 * - bound: 绑定成功（短暂，随后 reload 回 idle/selecting）
 *
 * TODO: 若需完整 `codeIssued → nodePending` 细分，可再按 codes/nodes 派生展示态，
 * 当前以 selectMode + bindNodeId 覆盖自动选中竞态即可。
 */
type BindFlowPhase = "idle" | "selecting" | "binding" | "bound";

export function NodeManagementPanel() {
  const { t } = useLanguage();
  const pack = useDomainPack();
  const opsSchema = useOpsSchema();
  const { isAdmin } = useAuth();
  const deviceTemplate = opsSchema?.devices.binding.deviceTemplate;
  useEffect(() => {
    registerDeviceTemplateForPack(pack.packId, deviceTemplate);
  }, [pack.packId, deviceTemplate]);
  const { packSlug } = useParams();
  const pairPath = packSlug?.trim() ? `/scenes/${packSlug.trim()}/ops/devices/pair` : "/scenes";
  const [codes, setCodes] = useState<NodeInstallCode[]>([]);
  const [nodes, setNodes] = useState<AdminNode[]>([]);
  const [activeNodes, setActiveNodes] = useState<AdminNode[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deploymentId, setDeploymentId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [bindNodeId, setBindNodeId] = useState("");
  const [bindDevicesJson, setBindDevicesJson] = useState("[]");
  /** open = 允许 auto-select；manual = 用户点选后锁定直至 deployment/entity 变更 */
  const [selectMode, setSelectMode] = useState<NodeSelectMode>("open");
  const [lastAutoSelectedId, setLastAutoSelectedId] = useState<string | null>(null);
  const [bindPhase, setBindPhase] = useState<BindFlowPhase>("idle");

  const reload = useCallback(async () => {
    try {
      setErr(null);
      const [c, pending, active] = await Promise.all([
        isAdmin ? listNodeInstallCodes() : Promise.resolve({ codes: [] as NodeInstallCode[] }),
        listAdminNodes("pending"),
        listAdminNodes("active"),
      ]);
      setCodes(c.codes || []);
      setNodes(pending.nodes || []);
      setActiveNodes(active.nodes || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [isAdmin]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useInterval(() => void reload(), NODES_POLL_MS, { visibleOnly: true });

  // 当前 deployment/entity 仅一条 pending 时自动选中（manual 模式下不覆盖）
  useEffect(() => {
    if (selectMode === "manual") return;
    if (bindPhase === "binding") return;
    const matched = nodes.filter((n) => pendingMatchesEntity(n, deploymentId, entityId));
    if (matched.length !== 1) return;
    const targetId = matched[0].node_id;
    if (bindNodeId === targetId || lastAutoSelectedId === targetId) return;
    setLastAutoSelectedId(targetId);
    setBindPhase("selecting");
    selectPendingNode(
      matched[0],
      pack.packId,
      {
        setBindNodeId,
        setDeploymentId,
        setEntityId,
        setBindDevicesJson,
        setErr,
        setMsg,
      },
      t,
    );
  }, [
    nodes,
    deploymentId,
    entityId,
    bindNodeId,
    pack.packId,
    t,
    selectMode,
    lastAutoSelectedId,
    bindPhase,
  ]);

  const entityMismatchCodes = codes.filter(
    (c) => c.entity_id && entityId && c.entity_id !== entityId,
  );
  const codesForCurrentEntity = codes.filter(
    (c) => c.deployment_id === deploymentId && (!entityId || c.entity_id === entityId),
  );
  const pendingForCurrentEntity = nodes.filter((n) =>
    pendingMatchesEntity(n, deploymentId, entityId),
  );

  function applyDeploymentId(value: string) {
    setDeploymentId(value);
    setSelectMode("open");
    setLastAutoSelectedId(null);
  }

  function applyEntityId(value: string) {
    setEntityId(value);
    setSelectMode("open");
    setLastAutoSelectedId(null);
  }

  function handleSelectPending(n: AdminNode) {
    setSelectMode("manual");
    setBindPhase("selecting");
    selectPendingNode(
      n,
      pack.packId,
      {
        setBindNodeId,
        setDeploymentId,
        setEntityId,
        setBindDevicesJson,
        setErr,
        setMsg,
      },
      t,
    );
  }

  async function doIssue() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await issueNodeInstallCode(deploymentId, entityId || undefined, 30);
      setMsg(
        t("console.devices.issueCodeSuccess", {
          code: res.install_code,
          expires: res.expires_at,
        }),
      );
      void reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doPairViaMqtt() {
    if (!bindNodeId.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await pairAdminNode(bindNodeId.trim(), deploymentId, entityId || undefined, 30);
      setMsg(
        res.mqtt_published
          ? t("console.devices.pairMqttOk", {
              code: res.install_code,
              node_id: bindNodeId,
            })
          : t("console.devices.pairMqttFail", { code: res.install_code }),
      );
      void reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doBind() {
    if (!bindNodeId.trim()) {
      setErr(t("console.devices.enterNodeId"));
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    setBindPhase("binding");
    try {
      let devices: BindNodeDevice[];
      try {
        devices = JSON.parse(bindDevicesJson);
      } catch {
        setErr(t("console.devices.invalidJson"));
        setBusy(false);
        setBindPhase("selecting");
        return;
      }
      const res = await bindAdminNode(bindNodeId.trim(), {
        deployment_id: deploymentId,
        entity_id: entityId || undefined,
        devices,
      });
      setMsg(
        t("console.devices.bindSuccess", {
          node_id: res.node.node_id,
          cv: String(res.node.config_version ?? 0),
        }),
      );
      setBindNodeId("");
      setSelectMode("open");
      setLastAutoSelectedId(null);
      setBindPhase("bound");
      void reload();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
      setBindPhase("selecting");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-panel">
      {isAdmin && (
        <p className="u-text-sm u-mb-sm">
          {t("console.devices.fieldInstallBefore")}{" "}
          <Link to={pairPath}>{t("console.devices.fieldInstallLink")}</Link>
          {t("console.devices.fieldInstallAfter")}
        </p>
      )}
      {err && <Banner variant="error">{err}</Banner>}
      {msg && <Banner variant="ok">{msg}</Banner>}

      <InstallCodePanel
        isAdmin={isAdmin}
        busy={busy}
        deploymentId={deploymentId}
        entityId={entityId}
        codes={codes}
        entityMismatchCodes={entityMismatchCodes}
        onDeploymentIdChange={applyDeploymentId}
        onEntityIdChange={applyEntityId}
        onIssue={() => void doIssue()}
        onPairViaMqtt={() => void doPairViaMqtt()}
        onRefresh={() => void reload()}
        bindNodeId={bindNodeId}
        t={t}
      />

      <PendingNodesPanel
        nodes={nodes}
        codesForCurrentEntity={codesForCurrentEntity}
        deploymentId={deploymentId}
        entityId={entityId}
        bindNodeId={bindNodeId}
        pendingForCurrentEntity={pendingForCurrentEntity}
        onSelectNode={handleSelectPending}
        t={t}
      />

      <ActiveNodesPanel activeNodes={activeNodes} t={t} />

      {isAdmin && (
        <AdminBindPanel
          busy={busy}
          bindNodeId={bindNodeId}
          bindDevicesJson={bindDevicesJson}
          onBindNodeIdChange={setBindNodeId}
          onBindDevicesJsonChange={setBindDevicesJson}
          onBind={() => void doBind()}
          t={t}
        />
      )}
    </section>
  );
}
