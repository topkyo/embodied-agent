export function commandDeliveryTtlMs(): number {
  const raw = Number.parseInt(process.env.COMMAND_DELIVERY_TTL_MS ?? "30000", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 30_000;
}

export function commandAckTimeoutMs(): number {
  const raw = Number.parseInt(process.env.COMMAND_ACK_TIMEOUT_MS ?? "15000", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 15_000;
}

export function commandRetryIntervalMs(): number {
  const raw = Number.parseInt(process.env.COMMAND_RETRY_INTERVAL_MS ?? "5000", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 5_000;
}

export function commandMaxRetries(): number {
  const raw = Number.parseInt(process.env.COMMAND_MAX_RETRIES ?? "2", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 2;
}
