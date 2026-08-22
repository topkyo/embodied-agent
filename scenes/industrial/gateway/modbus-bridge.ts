/**
 * Industrial gateway Modbus map → platform telemetry (read-only bridge).
 * No npm Modbus client yet — in-memory simulator proves the mapping contract.
 * Real TCP client lands when `modbus-serial` is approved (see scenes/industrial/docs/gateway-read-path.zh.md).
 */

export type ModbusRegisterKind = "holding" | "input" | "coil";

export type ModbusRegisterBinding = {
  /** Human label for install docs */
  label: string;
  kind: ModbusRegisterKind;
  address: number;
  /** Scale raw register → engineering unit (raw * scale) */
  scale?: number;
  /** Telemetry field name on entity (e.g. temperature_c) */
  telemetryField: string;
  unit?: string;
};

/** Default industrial over-temp cabinet map (demo / trial starter). */
export const INDUSTRIAL_CABINET_MODBUS_MAP: readonly ModbusRegisterBinding[] = [
  {
    label: "cabinet_temperature_c",
    kind: "holding",
    address: 0,
    scale: 0.1,
    telemetryField: "temperature_c",
    unit: "°C",
  },
  {
    label: "exhaust_relay_state",
    kind: "coil",
    address: 0,
    telemetryField: "exhaust_status",
  },
] as const;

export type ModbusSimulatorState = {
  holding: Map<number, number>;
  input: Map<number, number>;
  coil: Map<number, boolean>;
};

export function createEmptyModbusSimulatorState(): ModbusSimulatorState {
  return {
    holding: new Map(),
    input: new Map(),
    coil: new Map(),
  };
}

/** Seed a demo cabinet: 42.5°C (425 raw @ 0.1), exhaust off. */
export function seedIndustrialCabinetDemo(state: ModbusSimulatorState): void {
  state.holding.set(0, 425);
  state.coil.set(0, false);
}

export function readRegister(
  state: ModbusSimulatorState,
  kind: ModbusRegisterKind,
  address: number,
): number | boolean | undefined {
  if (kind === "holding") return state.holding.get(address);
  if (kind === "input") return state.input.get(address);
  return state.coil.get(address);
}

export function writeRegister(
  state: ModbusSimulatorState,
  kind: ModbusRegisterKind,
  address: number,
  value: number | boolean,
): void {
  if (kind === "holding") {
    state.holding.set(address, Number(value));
    return;
  }
  if (kind === "input") {
    state.input.set(address, Number(value));
    return;
  }
  state.coil.set(address, Boolean(value));
}

export type TelemetryBridgeRow = {
  entity_id: string;
  reported_at: string;
  [key: string]: unknown;
};

/**
 * Map simulator registers → entity telemetry row (compatible with UpsertTelemetryRow shape).
 * Coil → "on" | "off" string for exhaust_status; numeric fields use scale.
 */
export function bridgeModbusToTelemetry(args: {
  entityId: string;
  state: ModbusSimulatorState;
  map?: readonly ModbusRegisterBinding[];
  reportedAt?: string;
}): TelemetryBridgeRow {
  const map = args.map ?? INDUSTRIAL_CABINET_MODBUS_MAP;
  const reported_at = args.reportedAt ?? new Date().toISOString();
  const row: TelemetryBridgeRow = {
    entity_id: args.entityId,
    reported_at,
  };

  for (const binding of map) {
    const raw = readRegister(args.state, binding.kind, binding.address);
    if (raw === undefined) continue;
    if (binding.kind === "coil") {
      row[binding.telemetryField] = raw ? "on" : "off";
      continue;
    }
    const scale = binding.scale ?? 1;
    row[binding.telemetryField] = Number(raw) * scale;
  }

  return row;
}
