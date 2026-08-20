import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { atomicWriteJson } from "@embodied-agent/platform";
import {
  assertSettingsSecretsWritable,
  decryptSettingsSecrets,
  encryptSettingsSecrets,
} from "./secrets-at-rest.js";
import { mergeAdminTokenSectionIntoPersisted } from "./admin-tokens.js";
import { dataRoot } from "../fs/deployment-path.js";
import { normalizeProvider, PROVIDER_PRESETS, type LlmProvider } from "./provider.js";
import { isSttConfigured, normalizeSttProvider, type SttProviderId } from "./stt-provider.js";
import { resolveDeploymentCoordinatesSync } from "../integrations/weather/geo-locate.js";
import { maskApiKey } from "./mask-secret.js";

export type SatellitePlotConfig = {
  plot_id: string;
  entity_id?: string;
  west: number;
  south: number;
  east: number;
  north: number;
};

export type AgentSettings = {
  deployment_id: string;
  deployment_name: string;
  llm_provider: LlmProvider;
  llm_api_key?: string;
  llm_base_url: string;
  llm_model: string;
  llm_thinking: boolean;
  stt_provider: SttProviderId;
  stt_model: string;
  stt_api_key?: string;
  stt_app_key?: string;
  stt_app_id?: string;
  mqtt_url: string;
  integration_secret?: string;
  /** 遥测超阈值时主动推送到微信（默认开启） */
  alert_push_enabled?: boolean;
  /** 早晚定时简报（默认开启） */
  digest_enabled?: boolean;
  digest_morning_hour?: number;
  digest_evening_hour?: number;
  digest_timezone?: string;
  /** 农场纬度（手动保存时写入） */
  geo_latitude?: number;
  /** 农场经度（手动保存时写入） */
  geo_longitude?: number;
  /** manual=配置台锁定；未设时走 node GPS / IP 网络定位缓存 */
  geo_coordinates_source?: "manual";
  geo_coordinates_updated_at?: string;
  /** 查询类回复 NLG 润色（默认开启，需 LLM Key） */
  nlg_enabled?: boolean;
  /** When true, Flash-tier model also runs query NLG (default off to save latency). */
  nlg_flash_enabled?: boolean;
  /** 天气预警主动推送（默认开启，需坐标） */
  weather_proactive_enabled?: boolean;
  /** 卫星地块 bbox 列表 */
  satellite_plots?: SatellitePlotConfig[];
  /** Sentinel Hub 等遥感 API Key（可选） */
  satellite_api_key?: string;
  /** 当前 Deployment 启用的 Domain Pack id（须显式配置） */
  active_domain?: string;
  domain_configs?: Record<string, unknown>;
};

/** 开发/试点默认坐标（上海近郊，可在配置台覆盖） */
const envProvider = normalizeProvider(process.env.LLM_PROVIDER);
const preset = PROVIDER_PRESETS[envProvider];

const DEFAULTS: AgentSettings = {
  deployment_id: process.env.DEPLOYMENT_ID?.trim() || "",
  deployment_name: "示例现场",
  llm_provider: envProvider,
  llm_base_url: process.env.LLM_BASE_URL ?? preset.llm_base_url,
  llm_model: process.env.LLM_MODEL ?? preset.llm_model,
  llm_thinking: process.env.LLM_THINKING !== "0",
  stt_provider: normalizeSttProvider(process.env.STT_PROVIDER),
  stt_model: process.env.STT_MODEL ?? preset.stt_model,
  stt_api_key: process.env.STT_API_KEY,
  stt_app_key: process.env.STT_APP_KEY,
  stt_app_id: process.env.STT_APP_ID,
  mqtt_url: process.env.MQTT_URL ?? "",
  alert_push_enabled: process.env.ALERT_PUSH_ENABLED !== "0",
  digest_enabled: process.env.DIGEST_ENABLED !== "0",
  digest_morning_hour: Number(process.env.DIGEST_MORNING_HOUR ?? "7"),
  digest_evening_hour: Number(process.env.DIGEST_EVENING_HOUR ?? "22"),
  digest_timezone: process.env.DIGEST_TIMEZONE ?? "Asia/Shanghai",
  geo_latitude: process.env.GEO_LATITUDE ? Number(process.env.GEO_LATITUDE) : undefined,
  geo_longitude: process.env.GEO_LONGITUDE ? Number(process.env.GEO_LONGITUDE) : undefined,
  nlg_enabled: process.env.NLG_ENABLED !== "0",
  weather_proactive_enabled: process.env.WEATHER_PROACTIVE_ENABLED !== "0",
};

function settingsPath(): string {
  const base = dataRoot();
  return resolve(base, "settings.json");
}

export function loadSettingsFile(): Partial<AgentSettings> {
  const path = settingsPath();
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<AgentSettings>;
    return decryptSettingsSecrets(parsed);
  } catch (e) {
    throw new Error(
      `settings.json 无法读取或校验失败：${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
}

function resolveDeploymentId(file: Partial<AgentSettings>): string {
  const fromFile = file.deployment_id?.trim();
  if (fromFile) return fromFile;
  const fromEnv = process.env.DEPLOYMENT_ID?.trim();
  if (fromEnv) return fromEnv;
  throw new Error("deployment_id 未配置：请在 settings.json 或 DEPLOYMENT_ID 环境变量中显式设置。");
}

function parseActiveDomainPackEnv(): string | undefined {
  const raw = process.env.ACTIVE_DOMAIN?.trim();
  if (!raw) return undefined;
  if (raw.includes(",")) {
    throw new Error("ACTIVE_DOMAIN 只允许配置一个 Domain Pack id。");
  }
  return raw;
}

let cachedEffectiveSettings: AgentSettings | null = null;

function invalidateEffectiveSettingsCache(): void {
  cachedEffectiveSettings = null;
}

/** @internal test helper */
export function clearEffectiveSettingsCacheForTest(): void {
  invalidateEffectiveSettingsCache();
}

export function getEffectiveSettings(): AgentSettings {
  if (cachedEffectiveSettings) return cachedEffectiveSettings;
  const file = loadSettingsFile();
  const provider = normalizeProvider(file.llm_provider ?? DEFAULTS.llm_provider);
  const providerPreset = PROVIDER_PRESETS[provider];
  const settings: AgentSettings = {
    deployment_id: resolveDeploymentId(file),
    deployment_name: file.deployment_name ?? DEFAULTS.deployment_name,
    llm_provider: provider,
    // 空串视为未配置，回落 env（本地 settings.json 常写 `""` 占位）
    llm_api_key: file.llm_api_key?.trim() || process.env.LLM_API_KEY,
    llm_base_url: file.llm_base_url ?? providerPreset.llm_base_url,
    llm_model: file.llm_model ?? providerPreset.llm_model,
    llm_thinking: file.llm_thinking ?? DEFAULTS.llm_thinking,
    stt_provider: normalizeSttProvider(file.stt_provider ?? DEFAULTS.stt_provider),
    stt_model: file.stt_model ?? providerPreset.stt_model,
    stt_api_key: file.stt_api_key ?? DEFAULTS.stt_api_key,
    stt_app_key: file.stt_app_key ?? DEFAULTS.stt_app_key,
    stt_app_id: file.stt_app_id ?? DEFAULTS.stt_app_id,
    mqtt_url: file.mqtt_url ?? DEFAULTS.mqtt_url,
    integration_secret: file.integration_secret ?? process.env.INTEGRATION_SECRET,
    alert_push_enabled: file.alert_push_enabled ?? DEFAULTS.alert_push_enabled,
    digest_enabled: file.digest_enabled ?? DEFAULTS.digest_enabled,
    digest_morning_hour: file.digest_morning_hour ?? DEFAULTS.digest_morning_hour,
    digest_evening_hour: file.digest_evening_hour ?? DEFAULTS.digest_evening_hour,
    digest_timezone: file.digest_timezone ?? DEFAULTS.digest_timezone,
    geo_latitude: file.geo_latitude ?? DEFAULTS.geo_latitude,
    geo_longitude: file.geo_longitude ?? DEFAULTS.geo_longitude,
    geo_coordinates_source: file.geo_coordinates_source,
    geo_coordinates_updated_at: file.geo_coordinates_updated_at,
    nlg_enabled: file.nlg_enabled ?? DEFAULTS.nlg_enabled,
    nlg_flash_enabled: file.nlg_flash_enabled,
    weather_proactive_enabled: file.weather_proactive_enabled ?? DEFAULTS.weather_proactive_enabled,
    satellite_plots: file.satellite_plots ?? [],
    satellite_api_key: file.satellite_api_key ?? process.env.SATELLITE_API_KEY,
    active_domain: resolveActiveDomainWithMismatchCheck(
      file.active_domain,
      parseActiveDomainPackEnv(),
    ),
    domain_configs: file.domain_configs ?? {},
  };
  cachedEffectiveSettings = settings;
  return settings;
}

function validateActiveDomainFormat(value: string | undefined): string {
  if (value === undefined || !value.trim()) {
    throw new Error("active_domain 未配置：请在 settings.json 显式设置一个 live Domain Pack id。");
  }
  return value.trim();
}

function resolveActiveDomainWithMismatchCheck(
  fileValue: string | undefined,
  envValue: string | undefined,
): string {
  if (fileValue !== undefined && envValue !== undefined && fileValue.trim() !== envValue.trim()) {
    throw new Error(
      `active_domain 配置真源冲突：settings.json="${fileValue.trim()}" 与环境变量 ACTIVE_DOMAIN="${envValue.trim()}" 不一致。请统一二者，或只保留一个配置真源。`,
    );
  }
  const resolved = fileValue ?? envValue;
  return validateActiveDomainFormat(resolved);
}

function syncTestActiveDomainEnv(activeDomain: string): void {
  if (process.env.NODE_ENV === "test") {
    process.env.ACTIVE_DOMAIN = activeDomain;
  }
}

export function saveSettings(patch: Partial<AgentSettings>): AgentSettings {
  invalidateEffectiveSettingsCache();
  let current: AgentSettings | null;
  try {
    current = getEffectiveSettings();
  } catch {
    current = null;
  }
  const source: Partial<AgentSettings> = { ...(current ?? {}), ...patch };
  const provider = normalizeProvider(source.llm_provider ?? DEFAULTS.llm_provider);
  const providerPreset = PROVIDER_PRESETS[provider];
  const activeDomain =
    patch.active_domain !== undefined
      ? validateActiveDomainFormat(patch.active_domain)
      : validateActiveDomainFormat(source.active_domain);
  const sourceDomainConfigs = source.domain_configs ?? {};
  const next: AgentSettings = {
    deployment_id: resolveDeploymentId(source),
    deployment_name: source.deployment_name ?? DEFAULTS.deployment_name,
    llm_provider: provider,
    llm_api_key: patch.llm_api_key?.trim() || current?.llm_api_key,
    llm_base_url: source.llm_base_url ?? providerPreset.llm_base_url,
    llm_model: source.llm_model ?? providerPreset.llm_model,
    llm_thinking: source.llm_thinking ?? DEFAULTS.llm_thinking,
    stt_provider: normalizeSttProvider(source.stt_provider ?? DEFAULTS.stt_provider),
    stt_model: source.stt_model ?? providerPreset.stt_model,
    stt_api_key: source.stt_api_key,
    stt_app_key: source.stt_app_key,
    stt_app_id: source.stt_app_id,
    mqtt_url: source.mqtt_url ?? DEFAULTS.mqtt_url,
    integration_secret: source.integration_secret,
    alert_push_enabled: source.alert_push_enabled ?? DEFAULTS.alert_push_enabled,
    digest_enabled: source.digest_enabled ?? DEFAULTS.digest_enabled,
    digest_morning_hour: source.digest_morning_hour ?? DEFAULTS.digest_morning_hour,
    digest_evening_hour: source.digest_evening_hour ?? DEFAULTS.digest_evening_hour,
    digest_timezone: source.digest_timezone ?? DEFAULTS.digest_timezone,
    geo_latitude: source.geo_latitude,
    geo_longitude: source.geo_longitude,
    geo_coordinates_source: source.geo_coordinates_source,
    geo_coordinates_updated_at: source.geo_coordinates_updated_at,
    nlg_enabled: source.nlg_enabled ?? DEFAULTS.nlg_enabled,
    nlg_flash_enabled: source.nlg_flash_enabled,
    weather_proactive_enabled:
      source.weather_proactive_enabled ?? DEFAULTS.weather_proactive_enabled,
    satellite_plots: source.satellite_plots ?? [],
    satellite_api_key: source.satellite_api_key ?? process.env.SATELLITE_API_KEY,
    active_domain: activeDomain,
    domain_configs: {
      [activeDomain]: sourceDomainConfigs[activeDomain] ?? {},
    },
  };
  const path = settingsPath();
  const persisted = mergeAdminTokenSectionIntoPersisted(
    encryptSettingsSecrets(next) as Record<string, unknown>,
  );
  assertSettingsSecretsWritable(persisted);
  atomicWriteJson(path, persisted);
  syncTestActiveDomainEnv(activeDomain);
  invalidateEffectiveSettingsCache();
  return next;
}

/** 取消配置台手动锁定，恢复节点 GPS / IP / 缓存坐标链 */
export function unlockGeoCoordinates(): AgentSettings {
  const current = getEffectiveSettings();
  const next = { ...current } as AgentSettings & Record<string, unknown>;
  delete next.geo_latitude;
  delete next.geo_longitude;
  delete next.geo_coordinates_source;
  delete next.geo_coordinates_updated_at;
  const persisted = mergeAdminTokenSectionIntoPersisted(
    encryptSettingsSecrets(next) as Record<string, unknown>,
  );
  assertSettingsSecretsWritable(persisted);
  atomicWriteJson(settingsPath(), persisted);
  invalidateEffectiveSettingsCache();
  return getEffectiveSettings();
}

export { maskApiKey } from "./mask-secret.js";

export function toPublicSettings(s: AgentSettings) {
  let resolved: ReturnType<typeof resolveDeploymentCoordinatesSync> | null = null;
  let geoError: string | undefined;
  try {
    resolved = resolveDeploymentCoordinatesSync();
  } catch (e) {
    geoError = e instanceof Error ? e.message : String(e);
  }
  return {
    deployment_id: s.deployment_id,
    deployment_name: s.deployment_name,
    llm_provider: s.llm_provider,
    llm_base_url: s.llm_base_url,
    llm_model: s.llm_model,
    llm_thinking: s.llm_thinking,
    stt_provider: s.stt_provider,
    stt_model: s.stt_model,
    stt_enabled: isSttConfigured(s),
    stt_api_key_set: Boolean(s.stt_api_key),
    stt_api_key_masked: maskApiKey(s.stt_api_key),
    stt_app_key_set: Boolean(s.stt_app_key),
    stt_app_id_set: Boolean(s.stt_app_id),
    mqtt_url: s.mqtt_url,
    llm_api_key_set: Boolean(s.llm_api_key),
    llm_api_key_masked: maskApiKey(s.llm_api_key),
    integration_secret_set: Boolean(s.integration_secret),
    alert_push_enabled: s.alert_push_enabled !== false,
    digest_enabled: s.digest_enabled !== false,
    digest_morning_hour: s.digest_morning_hour ?? 7,
    digest_evening_hour: s.digest_evening_hour ?? 22,
    digest_timezone: s.digest_timezone ?? "Asia/Shanghai",
    geo_latitude: resolved?.latitude,
    geo_longitude: resolved?.longitude,
    geo_coordinates_source: resolved?.source,
    geo_coordinates_updated_at: resolved?.updated_at,
    geo_coordinates_city: resolved?.city,
    geo_coordinates_node_id: resolved?.node_id,
    geo_coordinates_accuracy_m: resolved?.accuracy_m,
    geo_coordinates_set: Boolean(resolved),
    geo_coordinates_error: geoError,
    nlg_enabled: s.nlg_enabled !== false,
    nlg_flash_enabled: s.nlg_flash_enabled === true,
    weather_proactive_enabled: s.weather_proactive_enabled !== false,
    satellite_plots: s.satellite_plots ?? [],
    satellite_plots_count: s.satellite_plots?.length ?? 0,
    satellite_api_key_set: Boolean(s.satellite_api_key),
    active_domain: s.active_domain,
    domain_configs: s.active_domain
      ? { [s.active_domain]: (s.domain_configs ?? {})[s.active_domain] ?? {} }
      : {},
  };
}
