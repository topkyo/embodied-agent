import type { DeviceRegistry } from "./registry.js";
import type { DomainPackStatus } from "./domain-pack-manifest.js";
import type { BindNodeDeviceTemplate, SkillDisplayMeta } from "./scene-primitives.js";

export type DomainPackOpsTabKind =
  "overview" | "control" | "settings" | "devices" | "users" | "review" | "platform" | "extension";

export type DomainPackOpsTab = {
  id: string;
  label: string;
  route: string;
  kind: DomainPackOpsTabKind;
  enabled: boolean;
  installer_only?: boolean;
  reason?: string;
  /** 可选 extension widget；Web ops shell 按 id 解析专属面板。 */
  widget_id?: string;
};

export type DomainPackOpsSettingsField = {
  id: string;
  label: string;
  scope: "platform" | "domain";
  type: "string" | "secret" | "number" | "boolean";
  control: "text" | "password" | "number" | "switch";
  save_target: "settings" | "domain_config" | "env_required";
  required: boolean;
  secret?: boolean;
  description?: string;
};

export type DomainPackOpsDeviceBinding = {
  required_transports: readonly string[];
  physical_skills: readonly string[];
  required_nodes: readonly string[];
  /** 节点绑定时预填的设备模板；由 active Domain Pack 在 ops schema extras 声明，前端按 schema 渲染。 */
  deviceTemplate?: readonly BindNodeDeviceTemplate[];
};

export type DomainPackOpsEvalSlice = {
  id: "golden" | "matrix_extra" | "matrix_wechat" | "matrix_negative";
  label: string;
  path: string;
  required: boolean;
};

export type DomainPackPhysicalSkillDefinition = {
  skill: string;
  display: SkillDisplayMeta;
};

export type DomainPackOpsAction = {
  id: string;
  label: string;
  skill: string;
  physical: boolean;
  requires_confirmation: boolean;
  display?: SkillDisplayMeta;
  target?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
};

export type DomainPackOpsSchema = {
  schema_version: 1;
  pack_id: string;
  display_name: string;
  status: DomainPackStatus;
  navigation: {
    tabs: readonly DomainPackOpsTab[];
  };
  settings: {
    fields: readonly DomainPackOpsSettingsField[];
  };
  devices: {
    binding: DomainPackOpsDeviceBinding;
  };
  control: {
    actions: readonly DomainPackOpsAction[];
  };
  eval_evidence: {
    slices: readonly DomainPackOpsEvalSlice[];
  };
};

export type OpsControlResolveInput = {
  action: DomainPackOpsAction;
  deployment_id: string;
  domainConfig?: unknown;
  registry: DeviceRegistry;
};
