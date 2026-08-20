import {
  CheckCircle2,
  Gamepad2,
  Gauge,
  RadioTower,
  Server,
  Settings2,
  type LucideIcon,
  Users,
} from "lucide-react";
import { type DomainPackOpsTab } from "../../api";

/** 侧栏分组：运行面 / 配置面 / 系统面 */
export type NavGroupId = "run" | "config" | "system";

export type NavItem = {
  to: string;
  icon: LucideIcon;
  key?: string;
  label?: string;
  end?: boolean;
  group: NavGroupId;
  order: number;
};

export type NavItemDef = {
  tabId: string;
  to: string;
  icon: LucideIcon;
  key: string;
  end?: boolean;
  group: NavGroupId;
  /** user 角色可见；admin 始终可见已声明项 */
  userVisible: boolean;
  /** legacy 导航是否包含（control 仅 schema + product UI） */
  legacy: boolean;
  order: number;
};

export type NavGroup = {
  id: NavGroupId;
  key: string;
  items: NavItem[];
};

export const NAV_GROUPS: readonly { id: NavGroupId; key: string }[] = [
  { id: "run", key: "sceneOps.nav.group.run" },
  { id: "config", key: "sceneOps.nav.group.config" },
  { id: "system", key: "sceneOps.nav.group.system" },
] as const;

/**
 * 单一 schema-driven 导航真源（替代 USER_NAV_ITEMS / ADMIN_NAV_ITEMS）。
 * 顺序：运行面 总览/设备/控制/复盘 → 配置面 场景配置/用户 → 系统面 平台底座
 */
export const NAV_ITEM_DEFS: readonly NavItemDef[] = [
  {
    tabId: "overview",
    to: "",
    icon: Gauge,
    key: "sceneOps.nav.overview",
    end: true,
    group: "run",
    userVisible: true,
    legacy: true,
    order: 10,
  },
  {
    tabId: "devices",
    to: "devices",
    icon: RadioTower,
    key: "sceneOps.nav.devices",
    group: "run",
    userVisible: true,
    legacy: true,
    order: 20,
  },
  {
    tabId: "control",
    to: "control",
    icon: Gamepad2,
    key: "sceneOps.nav.control",
    group: "run",
    userVisible: false,
    legacy: false,
    order: 30,
  },
  {
    tabId: "review",
    to: "review",
    icon: CheckCircle2,
    key: "sceneOps.nav.review",
    group: "run",
    userVisible: false,
    legacy: true,
    order: 40,
  },
  {
    tabId: "settings",
    to: "settings",
    icon: Settings2,
    key: "sceneOps.nav.settings",
    group: "config",
    userVisible: false,
    legacy: true,
    order: 10,
  },
  {
    tabId: "users",
    to: "users",
    icon: Users,
    key: "sceneOps.nav.users",
    group: "config",
    userVisible: false,
    legacy: true,
    order: 20,
  },
  {
    tabId: "platform",
    to: "platform",
    icon: Server,
    key: "sceneOps.nav.platform",
    group: "system",
    userVisible: false,
    legacy: true,
    order: 10,
  },
] as const;

export const NAV_DEF_BY_TAB = Object.fromEntries(NAV_ITEM_DEFS.map((d) => [d.tabId, d])) as Record<
  string,
  NavItemDef
>;

export const USER_TAB_IDS = new Set(NAV_ITEM_DEFS.filter((d) => d.userVisible).map((d) => d.tabId));

export const KIND_TO_GROUP: Record<string, NavGroupId> = {
  overview: "run",
  control: "run",
  devices: "run",
  review: "run",
  extension: "run",
  settings: "config",
  users: "config",
  platform: "system",
};

export function resolveGroup(tab: DomainPackOpsTab): NavGroupId {
  const def = NAV_DEF_BY_TAB[tab.id] ?? NAV_DEF_BY_TAB[tab.kind];
  if (def) return def.group;
  return KIND_TO_GROUP[tab.kind] ?? KIND_TO_GROUP[tab.id] ?? "run";
}

export function resolveOrder(tab: DomainPackOpsTab): number {
  const def = NAV_DEF_BY_TAB[tab.id] ?? NAV_DEF_BY_TAB[tab.kind];
  if (def) return def.order;
  return 500;
}

export function navItemFromOpsTab(tab: DomainPackOpsTab): NavItem {
  const def = NAV_DEF_BY_TAB[tab.id] ?? NAV_DEF_BY_TAB[tab.kind];
  const icon = def?.icon ?? Gauge;
  return {
    to: tab.route,
    icon,
    key: def?.key,
    label: def?.key ? undefined : tab.label,
    end: def?.end,
    group: resolveGroup(tab),
    order: resolveOrder(tab),
  };
}

export function navItemFromDef(def: NavItemDef): NavItem {
  return {
    to: def.to,
    icon: def.icon,
    key: def.key,
    end: def.end,
    group: def.group,
    order: def.order,
  };
}
