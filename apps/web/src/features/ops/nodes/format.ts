/** 相对时间桶：供 i18n 映射，不拼中文/英文硬编码文案 */
export type RelativeAge =
  | { unit: "none" }
  | { unit: "just_now" }
  | { unit: "minutes"; count: number }
  | { unit: "hours"; count: number }
  | { unit: "days"; count: number };

/** 将 ISO 时间转为相对年龄（纯函数，可单测） */
export function relativeAgeFromIso(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): RelativeAge {
  if (!iso) return { unit: "none" };
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return { unit: "none" };
  const deltaMs = Math.max(0, nowMs - ts);
  const sec = Math.floor(deltaMs / 1000);
  if (sec < 60) return { unit: "just_now" };
  const min = Math.floor(sec / 60);
  if (min < 60) return { unit: "minutes", count: min };
  const hr = Math.floor(min / 60);
  if (hr < 48) return { unit: "hours", count: hr };
  return { unit: "days", count: Math.floor(hr / 24) };
}

/** 主列表实体展示：优先 entity · deployment，缺 entity 时回退 node_id */
export function formatNodeEntityLabel(n: {
  entity_id?: string;
  deployment_id: string;
  node_id: string;
}): string {
  const entity = n.entity_id?.trim();
  if (entity) return `${entity} · ${n.deployment_id}`;
  return n.node_id;
}

/** 工程字段摘要：hover title / 详情，不进主文案 */
export function formatNodeTechTitle(n: {
  node_id: string;
  config_version?: number;
  firmware_version?: string;
  reported_at?: string | null;
}): string {
  const parts = [n.node_id, `cv=${n.config_version ?? 0}`];
  if (n.firmware_version) parts.push(`fw:${n.firmware_version}`);
  if (n.reported_at) {
    const ts = Date.parse(n.reported_at);
    if (!Number.isNaN(ts)) parts.push(`hb ${new Date(ts).toISOString()}`);
  }
  return parts.join(" ");
}

export function relativeAgeLabel(
  age: RelativeAge,
  t: (key: string, params?: Record<string, string>) => string,
): string | null {
  switch (age.unit) {
    case "none":
      return null;
    case "just_now":
      return t("console.devices.lastSeenJustNow");
    case "minutes":
      return t("console.devices.lastSeenMinutes", { n: String(age.count) });
    case "hours":
      return t("console.devices.lastSeenHours", { n: String(age.count) });
    case "days":
      return t("console.devices.lastSeenDays", { n: String(age.count) });
  }
}
