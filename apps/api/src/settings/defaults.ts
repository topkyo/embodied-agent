/**
 * 运维概览/设置面板展示默认值。
 *
 * 这些是 UI 展示层默认值（settings 未配置时的显示值），
 * 不是运行时隐式兜底。缺失必填配置时仍应失败可见。
 */

export const DISPLAY_DEFAULTS = {
  chat_channel: "dev",
  digest_morning_hour: 7,
  digest_evening_hour: 22,
  digest_timezone: "Asia/Shanghai",
} as const;
