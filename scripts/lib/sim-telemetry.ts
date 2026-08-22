export type SimTelemetryProfile = "greenhouse" | "industrial";

export type SimTelemetryState = {
  temperature_c: number;
  humidity_percent: number;
};

export type SimIndustrialTelemetryState = {
  temperature_c: number;
};

export type SimActuatorState = {
  vent: boolean;
  fan: boolean;
  irrigation: boolean;
};

const INDUSTRIAL_BASELINE_MIN_C = 45;
const INDUSTRIAL_BASELINE_MAX_C = 55;
const INDUSTRIAL_OVERHEAT_THRESHOLD_C = 55;
const INDUSTRIAL_OVERHEAT_CAP_C = 62;
const INDUSTRIAL_COOLING_FLOOR_C = 45;

const greenhouseStates = new Map<string, SimTelemetryState>();
const industrialStates = new Map<string, SimIndustrialTelemetryState>();
const actuators = new Map<string, SimActuatorState>();
const profiles = new Map<string, SimTelemetryProfile>();
const rhythmScenarios = new Map<string, string | undefined>();

const GREENHOUSE_EXCURSION_RESOLVED_C = 30;

function defaultActuators(): SimActuatorState {
  return { vent: false, fan: false, irrigation: false };
}

function greenhouseScenarioBase(scenario?: string): SimTelemetryState {
  if (scenario === "emergency_heat") {
    return { temperature_c: 36.2, humidity_percent: 70 };
  }
  if (scenario === "high_temp") {
    return { temperature_c: 33.2, humidity_percent: 72 };
  }
  if (scenario === "high_humidity") {
    return { temperature_c: 26.5, humidity_percent: 88 };
  }
  return { temperature_c: 28.1, humidity_percent: 70 };
}

function industrialScenarioBase(scenario?: string): SimIndustrialTelemetryState {
  if (scenario === "overheat") {
    return { temperature_c: 56.5 };
  }
  return { temperature_c: 50 };
}

/** full：gh-001 高湿 + gh-002 高温应急（≥35°C 风机场景） */
export function resolveSimScenario(
  nodeId: string,
  scenario?: string,
  greenhouseId?: string,
): string | undefined {
  if (scenario !== "full") return scenario;
  const gh = greenhouseId ?? (nodeId.includes("gh-002") ? "gh-002" : "gh-001");
  return gh === "gh-002" ? "emergency_heat" : "high_humidity";
}

export function resolveIndustrialSimScenario(scenario?: string): string | undefined {
  return scenario;
}

function profileFor(nodeId: string): SimTelemetryProfile {
  return profiles.get(nodeId) ?? "greenhouse";
}

export function initSimTelemetry(
  nodeId: string,
  scenario?: string,
  greenhouseId?: string,
  profile: SimTelemetryProfile = "greenhouse",
): void {
  profiles.set(nodeId, profile);
  if (profile === "industrial") {
    const resolved = resolveIndustrialSimScenario(scenario);
    industrialStates.set(nodeId, industrialScenarioBase(resolved));
  } else {
    const resolved = resolveSimScenario(nodeId, scenario, greenhouseId);
    greenhouseStates.set(nodeId, greenhouseScenarioBase(resolved));
  }
  actuators.set(nodeId, defaultActuators());
}

export function setSimVentActive(nodeId: string, active: boolean): void {
  const a = actuators.get(nodeId) ?? defaultActuators();
  a.vent = active;
  actuators.set(nodeId, a);
}

export function setSimFanActive(nodeId: string, active: boolean): void {
  const a = actuators.get(nodeId) ?? defaultActuators();
  a.fan = active;
  actuators.set(nodeId, a);
}

export function setSimIrrigationActive(nodeId: string, active: boolean): void {
  const a = actuators.get(nodeId) ?? defaultActuators();
  a.irrigation = active;
  actuators.set(nodeId, a);
}

export function readSimActuators(nodeId: string): SimActuatorState {
  return { ...(actuators.get(nodeId) ?? defaultActuators()) };
}

export function readSimTelemetry(nodeId: string): SimTelemetryState {
  if (profileFor(nodeId) === "industrial") {
    throw new Error(`readSimTelemetry() does not support industrial profile for ${nodeId}`);
  }
  if (!greenhouseStates.has(nodeId)) {
    initSimTelemetry(nodeId, process.env.SIM_TELEMETRY_SCENARIO, process.env.GREENHOUSE_ID);
  }
  return { ...greenhouseStates.get(nodeId)! };
}

export function readIndustrialSimTelemetry(nodeId: string): SimIndustrialTelemetryState {
  if (profileFor(nodeId) !== "industrial") {
    throw new Error(`readIndustrialSimTelemetry() requires industrial profile for ${nodeId}`);
  }
  if (!industrialStates.has(nodeId)) {
    initSimTelemetry(nodeId, process.env.SIM_TELEMETRY_SCENARIO, undefined, "industrial");
  }
  return { ...industrialStates.get(nodeId)! };
}

function isCooling(nodeId: string): boolean {
  const a = actuators.get(nodeId);
  return Boolean(a?.vent || a?.fan);
}

function effectiveSimScenario(
  nodeId: string,
  envScenario?: string,
  greenhouseId?: string,
): string | undefined {
  if (rhythmScenarios.has(nodeId)) {
    return rhythmScenarios.get(nodeId);
  }
  return profileFor(nodeId) === "industrial"
    ? resolveIndustrialSimScenario(envScenario)
    : resolveSimScenario(nodeId, envScenario, greenhouseId);
}

function tickGreenhouseSimTelemetry(nodeId: string): SimTelemetryState {
  const scenario = effectiveSimScenario(
    nodeId,
    process.env.SIM_TELEMETRY_SCENARIO,
    process.env.GREENHOUSE_ID,
  );
  const react = process.env.SIM_TELEMETRY_REACT === "1";
  const state = readSimTelemetry(nodeId);
  const actuator = readSimActuators(nodeId);

  if (react && isCooling(nodeId)) {
    state.temperature_c = Math.max(state.temperature_c - 0.35, 22);
    state.humidity_percent = Math.max(state.humidity_percent - 1.2, 48);
  } else if (react && actuator.irrigation) {
    state.humidity_percent = Math.min(state.humidity_percent + 0.25, 95);
  } else if (scenario === "emergency_heat" || scenario === "high_temp") {
    state.temperature_c = Math.min(state.temperature_c + 0.05, 37.5);
  } else if (scenario === "high_humidity") {
    // 通风结束后须能在飞轮 fast 窗口内回到晨间降露阈值（≥85%）
    state.humidity_percent = Math.min(state.humidity_percent + 0.45, 95);
  } else {
    state.temperature_c += (Math.random() - 0.5) * 0.1;
    state.humidity_percent += (Math.random() - 0.5) * 0.4;
  }

  greenhouseStates.set(nodeId, state);
  return state;
}

function tickIndustrialState(nodeId: string): SimIndustrialTelemetryState {
  const scenario = effectiveSimScenario(nodeId, process.env.SIM_TELEMETRY_SCENARIO);
  const react = process.env.SIM_TELEMETRY_REACT === "1";
  const state = readIndustrialSimTelemetry(nodeId);

  if (react && isCooling(nodeId)) {
    state.temperature_c = Math.max(state.temperature_c - 0.35, INDUSTRIAL_COOLING_FLOOR_C);
  } else if (scenario === "overheat") {
    state.temperature_c = Math.min(state.temperature_c + 0.05, INDUSTRIAL_OVERHEAT_CAP_C);
  } else {
    state.temperature_c += (Math.random() - 0.5) * 0.1;
    state.temperature_c = Math.min(
      INDUSTRIAL_BASELINE_MAX_C,
      Math.max(INDUSTRIAL_BASELINE_MIN_C, state.temperature_c),
    );
  }

  industrialStates.set(nodeId, state);
  return state;
}

export function tickSimTelemetry(nodeId: string): SimTelemetryState {
  if (profileFor(nodeId) === "industrial") {
    throw new Error(`tickSimTelemetry() does not support industrial profile for ${nodeId}`);
  }
  return tickGreenhouseSimTelemetry(nodeId);
}

export function tickIndustrialSimTelemetry(nodeId: string): SimIndustrialTelemetryState {
  if (profileFor(nodeId) !== "industrial") {
    throw new Error(`tickIndustrialSimTelemetry() requires industrial profile for ${nodeId}`);
  }
  return tickIndustrialState(nodeId);
}

export type SimCommandActuatorInput = {
  device_type?: string;
  action?: string;
};

function commandActuatorPhase(action?: string): "on" | "off" | undefined {
  if (action === "open" || action === "start" || action === "set_mode") return "on";
  if (action === "close" || action === "stop") return "off";
  return undefined;
}

/** 指令→执行器状态映射（node-simulator handleCommand 与单测共用真源）。 */
export function applySimCommandActuators(nodeId: string, cmd: SimCommandActuatorInput): void {
  const industrial = profileFor(nodeId) === "industrial";
  const phase = commandActuatorPhase(cmd.action);
  if (!phase) return;
  const active = phase === "on";
  if (!industrial && cmd.device_type === "vent_motor") {
    setSimVentActive(nodeId, active);
  } else if (cmd.device_type === "fan") {
    setSimFanActive(nodeId, active);
  } else if (!industrial && cmd.device_type === "irrigation_valve") {
    setSimIrrigationActive(nodeId, active);
  }
}

/** 脉冲式指令执行结束后复位被拉起的执行器。 */
export function releaseSimCommandActuators(nodeId: string, cmd: SimCommandActuatorInput): void {
  const industrial = profileFor(nodeId) === "industrial";
  if (commandActuatorPhase(cmd.action) !== "on") return;
  if (!industrial && cmd.device_type === "vent_motor") {
    setSimVentActive(nodeId, false);
  } else if (cmd.device_type === "fan") {
    setSimFanActive(nodeId, false);
  } else if (!industrial && cmd.device_type === "irrigation_valve") {
    setSimIrrigationActive(nodeId, false);
  }
}

export function resetSimTelemetryBaseline(nodeId: string): void {
  const profile = profileFor(nodeId);
  if (profile === "industrial") {
    industrialStates.set(nodeId, industrialScenarioBase(undefined));
  } else {
    greenhouseStates.set(nodeId, greenhouseScenarioBase(undefined));
  }
}

function setSimRhythmScenario(nodeId: string, scenario: string | undefined): void {
  if (scenario === undefined) {
    rhythmScenarios.delete(nodeId);
  } else {
    rhythmScenarios.set(nodeId, scenario);
  }
}

function enterExcursionScenario(nodeId: string, scenario: string): void {
  setSimRhythmScenario(nodeId, scenario);
  const profile = profileFor(nodeId);
  if (profile === "industrial") {
    industrialStates.set(nodeId, industrialScenarioBase(scenario));
  } else {
    greenhouseStates.set(nodeId, greenhouseScenarioBase(scenario));
  }
}

function isExcursionResolved(nodeId: string, excursionScenario: string): boolean {
  const profile = profileFor(nodeId);
  if (profile === "industrial") {
    if (excursionScenario !== "overheat") return false;
    return readIndustrialSimTelemetry(nodeId).temperature_c <= INDUSTRIAL_OVERHEAT_THRESHOLD_C;
  }
  if (excursionScenario !== "high_temp") return false;
  return readSimTelemetry(nodeId).temperature_c <= GREENHOUSE_EXCURSION_RESOLVED_C;
}

function localDayKey(nowMs: number): string {
  const d = new Date(nowMs);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type RhythmPhase = "stable" | "excursion";

export type CreateRhythmOptions = {
  minIntervalMs: number;
  maxIntervalMs: number;
  scenario: string;
  now: () => number;
  random?: () => number;
};

export type Rhythm = {
  tick: (nodeId: string) => void;
  getPhase: () => RhythmPhase;
  getActiveScenario: () => string | undefined;
  getNextExcursionAt: () => number | null;
};

export function createRhythm(opts: CreateRhythmOptions): Rhythm {
  const random = opts.random ?? Math.random;
  let phase: RhythmPhase = "stable";
  let nextExcursionAt = scheduleRhythmExcursion(
    opts.now(),
    opts.minIntervalMs,
    opts.maxIntervalMs,
    random,
  );
  let lastResetLocalDay = localDayKey(opts.now());
  // 跨日发生在 excursion 期间时不打断进行中场景，推迟到回稳后再复位。
  let pendingDailyReset = false;

  function scheduleNext(nowMs: number): number {
    return scheduleRhythmExcursion(nowMs, opts.minIntervalMs, opts.maxIntervalMs, random);
  }

  return {
    tick(nodeId: string) {
      const nowMs = opts.now();
      const day = localDayKey(nowMs);
      if (day !== lastResetLocalDay) {
        lastResetLocalDay = day;
        pendingDailyReset = true;
      }

      if (phase === "stable") {
        if (pendingDailyReset) {
          resetSimTelemetryBaseline(nodeId);
          pendingDailyReset = false;
        }
        if (nowMs >= nextExcursionAt) {
          phase = "excursion";
          enterExcursionScenario(nodeId, opts.scenario);
        }
        return;
      }

      if (isExcursionResolved(nodeId, opts.scenario)) {
        phase = "stable";
        setSimRhythmScenario(nodeId, undefined);
        resetSimTelemetryBaseline(nodeId);
        pendingDailyReset = false;
        nextExcursionAt = scheduleNext(nowMs);
      }
    },
    getPhase: () => phase,
    getActiveScenario: () => (phase === "excursion" ? opts.scenario : undefined),
    getNextExcursionAt: () => (phase === "stable" ? nextExcursionAt : null),
  };
}

function scheduleRhythmExcursion(
  nowMs: number,
  minIntervalMs: number,
  maxIntervalMs: number,
  random: () => number,
): number {
  const span = maxIntervalMs - minIntervalMs;
  const offset = span === 0 ? 0 : Math.min(span, Math.floor(random() * (span + 1)));
  return nowMs + minIntervalMs + offset;
}

export type RhythmIntervals = {
  minIntervalMs: number;
  maxIntervalMs: number;
};

/** 解析 `--rhythm=<min>-<max>m`（分钟）。非法格式必须失败可见。 */
export function parseRhythmArg(value: string): RhythmIntervals {
  const match = /^(\d+)-(\d+)m$/.exec(value.trim());
  if (!match) {
    throw new Error(`invalid --rhythm=${value} (expected <min>-<max>m, e.g. 30-60m)`);
  }
  const minMinutes = Number(match[1]);
  const maxMinutes = Number(match[2]);
  if (minMinutes <= 0 || maxMinutes <= 0 || minMinutes > maxMinutes) {
    throw new Error(`invalid --rhythm=${value} (minutes must be positive with min <= max)`);
  }
  return {
    minIntervalMs: minMinutes * 60_000,
    maxIntervalMs: maxMinutes * 60_000,
  };
}

/** CLI 入口：`--rhythm`（裸参数）与 `--rhythm=`（空串）都报错退出，不静默当作未启用。 */
export function resolveRhythmCliValue(
  raw: string | boolean | undefined,
): RhythmIntervals | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("--rhythm requires a value, e.g. --rhythm=30-60m");
  }
  return parseRhythmArg(raw);
}

export function clearSimTelemetryForTests(): void {
  greenhouseStates.clear();
  industrialStates.clear();
  actuators.clear();
  profiles.clear();
  rhythmScenarios.clear();
}

export const industrialSimTelemetryBounds = {
  baselineMinC: INDUSTRIAL_BASELINE_MIN_C,
  baselineMaxC: INDUSTRIAL_BASELINE_MAX_C,
  overheatThresholdC: INDUSTRIAL_OVERHEAT_THRESHOLD_C,
} as const;
