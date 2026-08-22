import type { DomainPackReadinessIssue } from "@embodied-agent/core";
import { collectDomainPackConfigRegistryIssues } from "@embodied-agent/runtime";
import { loadRegistry } from "@embodied-agent/node";
import { type AgentSettings } from "../../settings/store.js";
import { normalizeProvider, PROVIDER_PRESETS, type LlmProvider } from "../../settings/provider.js";
import { normalizeSttProvider } from "../../settings/stt-provider.js";
import type { getPrimaryDomainPackContract } from "../../domain-packs/loader.js";

export type SettingsPutBody = Partial<AgentSettings> & {
  llm_api_key?: string;
  llm_provider?: string;
};

export function blockingConfigRegistryReadinessIssues(
  contract: ReturnType<typeof getPrimaryDomainPackContract>,
  deployment_id: string,
  domainConfig: unknown,
): DomainPackReadinessIssue[] {
  return collectDomainPackConfigRegistryIssues({
    contract,
    deployment_id,
    domainConfig,
    registry: loadRegistry(),
  }).filter((item: DomainPackReadinessIssue) => item.severity === "error");
}

/** Build the basic patch fields from the PUT body (no validation-required fields). */
export function applyBasicPatchFields(body: SettingsPutBody): Partial<AgentSettings> {
  const patch: Partial<AgentSettings> = {};
  if (typeof body.deployment_id === "string") patch.deployment_id = body.deployment_id.trim();
  if (body.deployment_name) patch.deployment_name = body.deployment_name;
  if (body.llm_provider) {
    const p = normalizeProvider(body.llm_provider) as LlmProvider;
    patch.llm_provider = p;
    const preset = PROVIDER_PRESETS[p];
    if (!body.llm_base_url) patch.llm_base_url = preset.llm_base_url;
    if (!body.llm_model) patch.llm_model = preset.llm_model;
    if (!body.stt_model) patch.stt_model = preset.stt_model;
    patch.llm_thinking = preset.llm_thinking;
  }
  if (body.llm_base_url) patch.llm_base_url = body.llm_base_url;
  if (body.llm_model) patch.llm_model = body.llm_model;
  if (body.stt_model) patch.stt_model = body.stt_model;
  if (body.stt_provider) {
    patch.stt_provider = normalizeSttProvider(body.stt_provider);
  }
  if (body.stt_api_key?.trim()) patch.stt_api_key = body.stt_api_key.trim();
  if (body.stt_app_key?.trim()) patch.stt_app_key = body.stt_app_key.trim();
  if (body.stt_app_id?.trim()) patch.stt_app_id = body.stt_app_id.trim();
  if (typeof body.llm_thinking === "boolean") patch.llm_thinking = body.llm_thinking;

  if (body.integration_secret) patch.integration_secret = body.integration_secret;
  if (body.llm_api_key?.trim()) patch.llm_api_key = body.llm_api_key.trim();
  if (typeof body.alert_push_enabled === "boolean") {
    patch.alert_push_enabled = body.alert_push_enabled;
  }
  if (typeof body.digest_enabled === "boolean") {
    patch.digest_enabled = body.digest_enabled;
  }
  if (typeof body.digest_morning_hour === "number") {
    patch.digest_morning_hour = body.digest_morning_hour;
  }
  if (typeof body.digest_evening_hour === "number") {
    patch.digest_evening_hour = body.digest_evening_hour;
  }
  if (body.digest_timezone) patch.digest_timezone = body.digest_timezone;
  if (typeof body.geo_latitude === "number" && typeof body.geo_longitude === "number") {
    patch.geo_latitude = body.geo_latitude;
    patch.geo_longitude = body.geo_longitude;
    patch.geo_coordinates_source = "manual";
    patch.geo_coordinates_updated_at = new Date().toISOString();
  }
  if (typeof body.nlg_enabled === "boolean") {
    patch.nlg_enabled = body.nlg_enabled;
  }
  if (typeof body.weather_proactive_enabled === "boolean") {
    patch.weather_proactive_enabled = body.weather_proactive_enabled;
  }
  if (Array.isArray(body.satellite_plots)) {
    patch.satellite_plots = body.satellite_plots;
  }
  if (body.satellite_api_key?.trim()) {
    patch.satellite_api_key = body.satellite_api_key.trim();
  }
  return patch;
}
