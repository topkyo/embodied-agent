import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, XCircle } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useSceneOpsReadiness } from "../../contexts/SceneOpsReadinessContext";

/** 顶栏健康摘要：阻断时人话 + 链到平台页，不展示工程 code  alone。 */
export function SceneOpsReadinessBadge({ platformPath }: { platformPath?: string }) {
  const { t } = useLanguage();
  const { loading, error, ready, blocked, blockingIssue, data } = useSceneOpsReadiness();
  const prevBucketRef = useRef<"ready" | "blocked" | null>(null);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (loading && !data) return;
    const bucket: "ready" | "blocked" | null = ready ? "ready" : blocked ? "blocked" : null;
    if (bucket && prevBucketRef.current && prevBucketRef.current !== bucket) {
      setFlipped(true);
      const id = window.setTimeout(() => setFlipped(false), 550);
      prevBucketRef.current = bucket;
      return () => window.clearTimeout(id);
    }
    if (bucket) prevBucketRef.current = bucket;
  }, [ready, blocked, loading, data]);

  const flipClass = flipped ? " readiness-badge--flipped" : "";

  let label = t("sceneOps.readiness.checkingBadge");
  let Icon = LoaderCircle;
  let className = "checking";
  let title = t("sceneOps.readiness.checkingHint");
  let cta: string | null = null;

  if (error) {
    label = t("sceneOps.readiness.human.unavailable");
    Icon = AlertTriangle;
    className = "error";
    title = error;
    cta = t("sceneOps.readiness.cta.platform");
  } else if (loading && !data) {
    label = t("sceneOps.readiness.checkingBadge");
    Icon = LoaderCircle;
    className = "checking";
  } else if (ready) {
    label = t("sceneOps.readiness.human.ready");
    Icon = CheckCircle2;
    className = "ready";
    title = t("sceneOps.readiness.readyHint");
  } else if (blocked) {
    const code = blockingIssue?.code ?? "";
    const issueLabel = blockingIssue?.label ?? "";
    if (code.includes("node") || code.includes("Nodes") || /node/i.test(issueLabel)) {
      label = t("sceneOps.readiness.human.nodesOffline");
      cta = t("sceneOps.readiness.cta.devices");
    } else if (
      code.includes("mqtt") ||
      code.includes("Transport") ||
      /mqtt|transport/i.test(issueLabel)
    ) {
      label = t("sceneOps.readiness.human.mqttDown");
      cta = t("sceneOps.readiness.cta.platform");
    } else if (code.includes("llm") || /llm/i.test(issueLabel)) {
      label = t("sceneOps.readiness.human.llm");
      cta = t("sceneOps.readiness.cta.platform");
    } else if (
      code.includes("registry") ||
      code.includes("domain_registry") ||
      /registry/i.test(issueLabel)
    ) {
      label = t("sceneOps.readiness.human.registry");
      cta = t("sceneOps.readiness.cta.devices");
    } else {
      label = t("sceneOps.readiness.human.blocked");
      cta = t("sceneOps.readiness.cta.platform");
    }
    Icon = XCircle;
    className = "blocked";
    title = blockingIssue?.detail ?? blockingIssue?.label ?? t("sceneOps.readiness.blockedHint");
  }

  const body = (
    <>
      <Icon size={14} aria-hidden className={loading && !error && !ready ? "spin" : undefined} />
      <span>{label}</span>
      {cta && blocked && <span className="scene-ops-readiness-cta"> · {cta}</span>}
    </>
  );

  if (platformPath && (blocked || error)) {
    const to =
      cta === t("sceneOps.readiness.cta.devices")
        ? platformPath.replace(/\/platform\/?$/, "/devices")
        : platformPath;
    return (
      <Link
        to={to}
        className={`scene-ops-readiness-badge ${className} scene-ops-readiness-badge-link${flipClass}`}
        title={title}
      >
        {body}
      </Link>
    );
  }

  return (
    <span className={`scene-ops-readiness-badge ${className}${flipClass}`} title={title}>
      {body}
    </span>
  );
}
