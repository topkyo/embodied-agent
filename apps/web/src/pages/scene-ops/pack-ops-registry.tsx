import type { LucideIcon } from "lucide-react";
import { Factory, Thermometer } from "lucide-react";
import type { ComponentType } from "react";
import type { AdminOverview, DomainPackOpsSchema } from "../../api";
import type { useLanguage } from "../../contexts/LanguageContext";
import { AgricultureOverviewPanel } from "./AgricultureOpsPanel";
import { IndustrialOverviewPanel } from "./IndustrialOpsPanel";
import {
  RobotControlPanel,
  RobotDevicesPanel,
  RobotOverviewPanel,
  RobotReviewPanel,
  RobotSettingsPanel,
  ROBOT_CONTROL_FALLBACK_ACTIONS,
} from "./robot";

export type PackOverviewPanelProps = {
  overview: AdminOverview;
  t: ReturnType<typeof useLanguage>["t"];
  executing?: boolean;
};

export type PackOpsPanels = {
  overviewIcon: LucideIcon;
  showGenericMetrics: boolean;
  showGenericNodes: boolean;
  showReadonlyOps: boolean;
  OverviewPanel?: ComponentType<PackOverviewPanelProps>;
  SettingsPanel?: ComponentType;
  DevicesPanel?: ComponentType;
  ControlPanel?: ComponentType;
  ReviewPanel?: ComponentType;
  settingsEyebrow?: string;
  settingsTitle?: string;
  settingsLead?: string;
  controlEyebrow?: string;
  controlTitle?: string;
  controlLead?: string;
  controlRequiresInstaller?: boolean;
};

const DEFAULT_PACK_OPS: PackOpsPanels = {
  overviewIcon: Factory,
  showGenericMetrics: true,
  showGenericNodes: true,
  showReadonlyOps: true,
};

/**
 * schema-driven extension widgets；新 pack 在此注册 widget_id，不再按 packId 分支。
 * robotics control 的 fallback action list 见 robot/control-actions.ts（schema 空时使用）。
 */
const OPS_WIDGET_REGISTRY: Partial<Record<string, Partial<PackOpsPanels>>> = {
  "agriculture-overview": {
    overviewIcon: Thermometer,
    OverviewPanel: AgricultureOverviewPanel,
  },
  "industrial-overview": {
    overviewIcon: Factory,
    OverviewPanel: IndustrialOverviewPanel,
  },
  "robotics-overview": {
    overviewIcon: Factory,
    showGenericMetrics: false,
    showGenericNodes: false,
    OverviewPanel: RobotOverviewPanel,
  },
  "robotics-settings": {
    SettingsPanel: RobotSettingsPanel,
  },
  "robotics-devices": {
    DevicesPanel: RobotDevicesPanel,
  },
  "robotics-control": {
    ControlPanel: RobotControlPanel,
    controlRequiresInstaller: true,
  },
  "robotics-review": {
    ReviewPanel: RobotReviewPanel,
  },
};

/** 供测试与文档引用：schema 未声明 control.actions 时的 fallback 列表。 */
export { ROBOT_CONTROL_FALLBACK_ACTIONS };

function mergePackOpsPanels(...layers: Array<Partial<PackOpsPanels> | undefined>): PackOpsPanels {
  return layers.reduce<PackOpsPanels>((acc, layer) => (layer ? { ...acc, ...layer } : acc), {
    ...DEFAULT_PACK_OPS,
  });
}

export function resolvePackOpsWidget(widgetId: string | undefined): PackOpsPanels {
  if (!widgetId) return DEFAULT_PACK_OPS;
  return mergePackOpsPanels(OPS_WIDGET_REGISTRY[widgetId]);
}

export function resolvePackOpsPanelsFromSchema(
  schema: DomainPackOpsSchema | null | undefined,
  tabId: string,
): PackOpsPanels {
  const tab = schema?.navigation.tabs.find((item) => item.id === tabId);
  return resolvePackOpsWidget(tab?.widget_id);
}
