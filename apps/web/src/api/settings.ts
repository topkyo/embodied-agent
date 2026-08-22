import { adminFetch } from "./admin-fetch.js";

export type LlmProvider = "deepseek" | "openai";

export type SttProviderId = "none" | "openai_whisper" | "aliyun" | "iflytek";

export type GeoSource = "manual" | "node" | "env" | "ip";

export type PublicSettings = {
  deployment_id: string;
  deployment_name: string;
  llm_provider: LlmProvider;
  llm_base_url: string;
  llm_model: string;
  llm_thinking: boolean;
  stt_provider: SttProviderId;
  stt_model: string;
  stt_enabled: boolean;
  stt_api_key_set: boolean;
  stt_api_key_masked?: string;
  stt_app_key_set: boolean;
  stt_app_id_set: boolean;
  mqtt_url: string;
  llm_api_key_set: boolean;
  llm_api_key_masked?: string;
  integration_secret_set: boolean;
  geo_latitude?: number;
  geo_longitude?: number;
  geo_coordinates_source?: GeoSource;
  geo_coordinates_updated_at?: string;
  geo_coordinates_city?: string;
  geo_coordinates_node_id?: string;
  geo_coordinates_accuracy_m?: number;
  geo_coordinates_set?: boolean;
  geo_coordinates_error?: string;
  weather_proactive_enabled?: boolean;
  nlg_enabled?: boolean;
  alert_push_enabled?: boolean;
  digest_enabled?: boolean;
  digest_morning_hour?: number;
  digest_evening_hour?: number;
  digest_timezone?: string;
  satellite_plots?: SatellitePlotConfig[];
  satellite_plots_count?: number;
  satellite_api_key_set?: boolean;
  active_domain?: string;
  domain_configs?: {
    robotics?: {
      m20_base_url?: string;
      default_robot_id?: string;
      waypoints?: RobotWaypoint[];
    };
    [packId: string]: unknown;
  };
};

export type SatellitePlotConfig = {
  plot_id: string;
  entity_id?: string;
  west: number;
  south: number;
  east: number;
  north: number;
};

export type RobotWaypoint = {
  waypoint_id: string;
  name?: string;
  points: Record<string, unknown>[];
};

export type RobotDevice = {
  device_id: string;
  deployment_id: string;
  device_type: "robot_dog";
  name: string;
  aliases: string[];
  node_id: string;
  status: "active" | "offline" | "maintenance" | "disabled";
  default_for?: "robot_dog";
  [k: string]: unknown;
};

export type RobotConfig = {
  active_domain: string;
  m20_base_url: string;
  default_robot_id: string;
  waypoints: RobotWaypoint[];
  robots: RobotDevice[];
};

export type RobotOverview = {
  active_domain: string;
  configured: boolean;
  robots: RobotDevice[];
  default_robot_id: string;
  pending_confirms_count: number;
  m20: {
    ok: boolean;
    status?: unknown;
    sensors?: unknown;
    obstacle?: unknown;
    pose?: unknown;
    navigation?: unknown;
    error?: string;
  };
};

export type RobotIntentResponse = {
  reply: string;
  status: number;
};

export type AdminDeploymentsResponse = {
  active_deployment_id: string;
  deployments: { deployment_id: string; name?: string }[];
};

export type AdminStatus = {
  api: string;
  deployment_id: string;
  deployment_name: string;
  llm_configured: boolean;
  llm_provider: LlmProvider;
  llm_model: string;
  stt_provider: SttProviderId;
  stt_model: string;
  stt_enabled: boolean;
  mqtt_url: string;
  chat_channel: string;
};

export const PROVIDER_PRESETS: Record<
  LlmProvider,
  { llm_base_url: string; llm_model: string; stt_model: string }
> = {
  deepseek: {
    llm_base_url: "https://api.deepseek.com/v1",
    llm_model: "deepseek-v4-flash",
    stt_model: "whisper-1",
  },
  openai: {
    llm_base_url: "https://api.openai.com/v1",
    llm_model: "gpt-4o",
    stt_model: "whisper-1",
  },
};

export function fetchSettings(): Promise<PublicSettings> {
  return adminFetch("/admin/settings");
}

export function fetchStatus(): Promise<AdminStatus> {
  return adminFetch("/admin/status");
}

export type PublicDomainPackCatalogEntry = {
  id: string;
  display_name: string;
  web_slug: string;
  status: "live" | "placeholder";
  active: boolean;
  capabilities?: DomainPackCapabilities;
};

export type PublicDomainPacksResponse = {
  catalog: PublicDomainPackCatalogEntry[];
  active_domain: string;
  deployment_id: string;
};

export async function fetchPublicDomainPacks(): Promise<PublicDomainPacksResponse> {
  const res = await fetch("/domain-packs");
  if (!res.ok) {
    throw new Error(`domain_packs_http_${res.status}`);
  }
  return (await res.json()) as PublicDomainPacksResponse;
}

export type AdminOverviewEntity = {
  entity_id: string;
  entity_type: string;
  domain_id?: string;
  name?: string;
  telemetry?: Record<string, unknown>;
  reported_at?: string;
  stale: boolean;
};

export type AdminOverviewNode = {
  node_id: string;
  deployment_id?: string;
  entity_id?: string;
  status: string;
  online: boolean;
  reported_at: string | null;
};

/** Read-only projection from GET /admin/overview pending_confirms (matches API). */
export type PendingConfirmView = {
  user_id: string;
  created_at: number;
  expires_at: number;
  scene_skill_id?: string;
  action_summary: string;
  target_summary: string;
};

export type AdminOverview = {
  deployment_id: string;
  deployment_name: string;
  entities: AdminOverviewEntity[];
  nodes: AdminOverviewNode[];
  services: AdminStatus & {
    mqtt_publisher?: { connected?: boolean };
    alert_push_enabled?: boolean;
    digest_enabled?: boolean;
    digest_morning_hour?: number;
    digest_evening_hour?: number;
    digest_timezone?: string;
  };
  pending_confirms_count: number;
  pending_confirms: PendingConfirmView[];
  active_alert_rules_count: number;
};

export function fetchOverview(): Promise<AdminOverview> {
  return adminFetch("/admin/overview");
}

export type DomainPackReadinessIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type DomainPackReadiness = {
  pack_id: string;
  display_name: string;
  status: "live" | "placeholder";
  readiness: "ready" | "blocked" | "placeholder";
  deliverable: boolean;
  eval: {
    golden_rows: number;
    matrix_extra_rows: number;
    matrix_wechat_rows: number;
    matrix_negative_rows: number;
    valid_rows?: number;
    invalid_rows?: number;
    covered_skills?: string[];
    missing_required_skills?: string[];
  };
  issues: DomainPackReadinessIssue[];
};

export type AdminDomainPackCatalogEntry = {
  id: string;
  display_name: string;
  status: "live" | "placeholder";
  active: boolean;
  capabilities?: DomainPackCapabilities;
  readiness?: DomainPackReadiness;
  ops_schema?: DomainPackOpsSchema;
};

export type DomainPackCapabilities = {
  digest?: boolean;
  weeklyAdvice?: boolean;
  weatherProactive?: boolean;
  scheduledReports?: boolean;
  policySuggestions?: boolean;
  satellite?: boolean;
};

export type AdminDomainPacksResponse = {
  catalog: AdminDomainPackCatalogEntry[];
  active_domain: string;
  deployment_id: string;
  primary_pack_id: string | null;
  active_ops_schema?: DomainPackOpsSchema | null;
  active_error?: string | null;
};

export function fetchDomainPacks(): Promise<AdminDomainPacksResponse> {
  return adminFetch("/admin/domain-packs");
}

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
  widget_id?: string;
};

export type BindNodeDeviceTemplate = {
  /** device_id 模板，支持 {node} 占位符（绑定节点时替换为 node id 去除 node- 前缀的 suffix）。 */
  device_id: string;
  device_type: string;
  name: string;
  channel?: string;
  metrics?: readonly string[];
  default_for?: string;
  max_duration_seconds?: number;
  status?: string;
};

export type DomainPackOpsSchema = {
  schema_version: 1;
  pack_id: string;
  display_name: string;
  status: "live" | "placeholder";
  navigation: {
    tabs: DomainPackOpsTab[];
  };
  settings: {
    fields: {
      id: string;
      label: string;
      scope: "platform" | "domain";
      type: "string" | "secret" | "number" | "boolean";
      control: "text" | "password" | "number" | "switch";
      save_target: "settings" | "domain_config" | "env_required";
      required: boolean;
      secret?: boolean;
      description?: string;
    }[];
  };
  devices: {
    binding: {
      required_transports: string[];
      physical_skills: string[];
      required_nodes: string[];
      deviceTemplate?: readonly BindNodeDeviceTemplate[];
    };
  };
  control: {
    actions: {
      id: string;
      label: string;
      skill: string;
      physical: boolean;
      requires_confirmation: boolean;
    }[];
  };
  eval_evidence: {
    slices: {
      id: "golden" | "matrix_extra" | "matrix_wechat" | "matrix_negative";
      label: string;
      path: string;
      required: boolean;
    }[];
  };
};

export type PlatformReadiness = {
  ready: boolean;
  generated_at: string;
  deployment_id: string;
  active_domain: string;
  checks: {
    id: string;
    ok: boolean;
    label: string;
    detail: string;
    severity: "error" | "warning";
  }[];
  packs: DomainPackReadiness[];
  runtime_issues: DomainPackReadinessIssue[];
  reports: {
    slice: "core" | "wechat" | "negative";
    path: string | null;
    ok: boolean;
    fresh: boolean;
    at?: string;
    pass_rate?: number;
    min_pass_rate?: number;
    total?: number;
    detail: string;
  }[];
  pending_confirms_count: number;
};

export function fetchPlatformReadiness(): Promise<PlatformReadiness> {
  return adminFetch("/admin/platform/readiness");
}

export type PilotBaseline = {
  deployment_id: string;
  manual_run_shed_count_per_week?: number;
  notes?: string;
  updated_at: string;
};

export function fetchPilotBaseline(): Promise<{ baseline: PilotBaseline | null }> {
  return adminFetch("/admin/pilot/baseline");
}

export function savePilotBaseline(patch: {
  manual_run_shed_count_per_week?: number;
  notes?: string;
}): Promise<{ baseline: PilotBaseline }> {
  return adminFetch("/admin/pilot/baseline", {
    method: "POST",
    body: JSON.stringify(patch),
  });
}

export function saveSettings(patch: Record<string, unknown>) {
  return adminFetch("/admin/settings", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}
