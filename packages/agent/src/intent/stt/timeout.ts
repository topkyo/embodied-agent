const DEFAULT_STT_TIMEOUT_MS = 15_000;

/** 解析 STT_TIMEOUT_MS；非法值（非数字/非正数）回退默认，避免 setTimeout(NaN) 立即超时。 */
export function resolveSttTimeoutMs(raw = process.env.STT_TIMEOUT_MS): number {
  const n = Number(raw?.trim());
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STT_TIMEOUT_MS;
}
