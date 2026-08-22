import { getEffectiveSettings } from "../settings/store.js";

const MQTT_URL_SCHEMES = new Set(["mqtt:", "mqtts:", "ws:", "wss:"]);

/** mqtt_url 语法 + scheme 校验；空串视为未配置（invalid）。 */
export function isValidMqttUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return MQTT_URL_SCHEMES.has(parsed.protocol) && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * 解析当前生效的 MQTT URL：显式注入 > settings.mqtt_url（settings 内部已含 MQTT_URL env 回退，
 * 与 settings/store.ts「文件优先」语义一致；配置台保存后无需重启 env 即生效）。
 * 空串/缺失返回 undefined —— 调用方必须失败可见，禁止把 "" 交给 mqtt.connect。
 */
export function resolveConfiguredMqttUrl(explicit?: string): string | undefined {
  const url = explicit?.trim() || getEffectiveSettings().mqtt_url?.trim();
  if (!url) return undefined;
  if (!isValidMqttUrl(url)) {
    const redacted = url.replace(/\/\/[^@/]+@/, "//***@");
    throw new Error(`mqtt_url 无效：${redacted}（须为 mqtt:// mqtts:// ws:// wss:// 且含 host）。`);
  }
  return url;
}
