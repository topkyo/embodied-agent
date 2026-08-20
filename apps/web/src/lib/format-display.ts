import type { Lang } from "../i18n";

type Translate = (key: string, params?: Record<string, string>) => string;

/** ISO / Date → 本地化可读时间（zh-CN / en-US）。无效输入原样返回。 */
export function formatLocalizedDateTime(value: string | Date, lang: Lang): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : String(value);
  }
  return date.toLocaleString(lang === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** snake/kebab/dot skill id → Title Case 空格串（无 i18n 时的兜底）。 */
export function formatSkillIdFallback(skillId: string): string {
  const parts = skillId.split(/[._\s-]+/).filter(Boolean);
  if (parts.length === 0) return skillId;
  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(" ");
}

/**
 * 场景 skill id → 人读名。
 * 优先 `sceneOps.review.skill.{id}`；缺键则 title-case 空格兜底。
 */
export function formatSceneSkillDisplayName(skillId: string, t: Translate): string {
  if (!skillId) return skillId;
  const key = `sceneOps.review.skill.${skillId}`;
  const label = t(key);
  if (label !== key) return label;
  return formatSkillIdFallback(skillId);
}

export type ReadinessIssueLike = {
  code?: string;
  id?: string;
  label?: string;
  detail?: string;
};

/** 将 readiness check/issue 的工程 label 映射为安装员可读标题。 */
export function humanizeReadinessTitle(issue: ReadinessIssueLike, t: Translate): string {
  const id = issue.code ?? issue.id ?? "";
  const label = issue.label ?? "";
  if (/node|Nodes/i.test(id) || /\bnode/i.test(label)) {
    return t("sceneOps.readiness.human.nodesOffline");
  }
  if (/mqtt|transport|Transport/i.test(id) || /mqtt|transport/i.test(label)) {
    return t("sceneOps.readiness.human.mqttDown");
  }
  if (/llm|LLM/i.test(id) || /\bllm\b/i.test(label)) {
    return t("sceneOps.readiness.human.llm");
  }
  if (/registry|domain_registry/i.test(id) || /registry/i.test(label)) {
    return t("sceneOps.readiness.human.registry");
  }
  if (/domain_config|config/i.test(id) || /Domain Config|config/i.test(label)) {
    return t("sceneOps.readiness.human.config");
  }
  // 仍是英文工程标签时不原样露出
  if (/^[A-Za-z][A-Za-z0-9 _/-]*$/.test(label) && /[A-Z]/.test(label)) {
    return t("sceneOps.readiness.human.blocked");
  }
  return label || t("sceneOps.readiness.human.blocked");
}

/** 节点在线数等常见英文 detail → 本地化；其余原样（后端多为中文）。 */
export function humanizeReadinessDetail(issue: ReadinessIssueLike, t: Translate): string {
  const detail = issue.detail ?? "";
  const id = issue.code ?? issue.id ?? "";
  const label = issue.label ?? "";
  if (/node|Nodes/i.test(id) || /\bnode/i.test(label)) {
    const m = detail.match(/(\d+)\s*\/\s*(\d+)\s*online/i);
    if (m) {
      return t("sceneOps.readiness.summary.nodesOnlineCount", {
        online: m[1]!,
        total: m[2]!,
      });
    }
  }
  return detail;
}
