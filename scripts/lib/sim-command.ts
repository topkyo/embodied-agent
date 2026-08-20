/** 0 = 按用户指令 duration_seconds 完整等待，不做硬性截断 */
export const DEFAULT_SIM_MAX_COMMAND_MS = 0;
export const STOP_SIM_MS = 300;

export function resolveSimMaxCommandMs(opts: { realtime?: boolean; envValue?: string }): number {
  if (opts.realtime) return 0;
  const n = Number(opts.envValue ?? DEFAULT_SIM_MAX_COMMAND_MS);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SIM_MAX_COMMAND_MS;
}

export type SimCommandInput = {
  action: string;
  durationSeconds?: number;
  maxCommandMs: number;
};

export function requiresPulseDuration(action: string): boolean {
  return action === "open" || action === "start" || action === "close";
}

export function resolveCommandSleepMs(input: SimCommandInput): number {
  if (input.action === "stop") return STOP_SIM_MS;
  if (!requiresPulseDuration(input.action)) return 0;
  if (
    typeof input.durationSeconds !== "number" ||
    !Number.isFinite(input.durationSeconds) ||
    input.durationSeconds <= 0
  ) {
    throw new Error(`duration_seconds required for ${input.action}`);
  }
  const requestedSeconds = input.durationSeconds;
  const requestedMs = requestedSeconds * 1000;
  if (input.maxCommandMs > 0) return Math.min(requestedMs, input.maxCommandMs);
  return requestedMs;
}

export function elapsedSeconds(startedAtMs: number, endedAtMs: number): number {
  return Math.max(1, Math.round((endedAtMs - startedAtMs) / 1000));
}

export function buildCompletedResult(
  action: string,
  actualSeconds: number,
): { reason: string; actual_duration_seconds: number } {
  if (action === "stop") {
    return { reason: "stopped", actual_duration_seconds: actualSeconds };
  }
  return { reason: "duration_elapsed", actual_duration_seconds: actualSeconds };
}

/** 断言：模拟完成耗时应反映真实等待，不得直接等于计划时长（当计划时长超过 cap 时）。 */
export function assertSimDurationReport(
  plannedSeconds: number,
  actualSeconds: number,
  maxCommandMs: number,
): void {
  const capSeconds = maxCommandMs > 0 ? Math.ceil(maxCommandMs / 1000) : plannedSeconds;
  if (plannedSeconds > capSeconds) {
    if (actualSeconds >= plannedSeconds) {
      throw new Error(
        `模拟器上报 actual_duration_seconds=${actualSeconds} 不应等于计划 ${plannedSeconds}s（cap=${capSeconds}s）`,
      );
    }
    if (actualSeconds > capSeconds + 1) {
      throw new Error(
        `模拟器上报 actual_duration_seconds=${actualSeconds} 超过 cap ${capSeconds}s`,
      );
    }
  }
}
