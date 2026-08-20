import { describe, expect, it } from "vitest";
import {
  bridgeModbusToTelemetry,
  createEmptyModbusSimulatorState,
  INDUSTRIAL_CABINET_MODBUS_MAP,
  seedIndustrialCabinetDemo,
  writeRegister,
} from "./modbus-bridge.js";

describe("industrial modbus bridge (simulator)", () => {
  it("seeds demo cabinet and bridges temperature + exhaust", () => {
    const state = createEmptyModbusSimulatorState();
    seedIndustrialCabinetDemo(state);
    const row = bridgeModbusToTelemetry({
      entityId: "cabinet-01",
      state,
      reportedAt: "2026-07-16T00:00:00.000Z",
    });
    expect(row.entity_id).toBe("cabinet-01");
    expect(row.temperature_c).toBe(42.5);
    expect(row.exhaust_status).toBe("off");
    expect(row.reported_at).toBe("2026-07-16T00:00:00.000Z");
  });

  it("reflects coil on after write", () => {
    const state = createEmptyModbusSimulatorState();
    seedIndustrialCabinetDemo(state);
    writeRegister(state, "coil", 0, true);
    const row = bridgeModbusToTelemetry({ entityId: "cabinet-01", state });
    expect(row.exhaust_status).toBe("on");
  });

  it("skips unbound addresses without throwing", () => {
    const state = createEmptyModbusSimulatorState();
    const row = bridgeModbusToTelemetry({ entityId: "cabinet-01", state });
    expect(row.entity_id).toBe("cabinet-01");
    expect(row.temperature_c).toBeUndefined();
    expect(row.exhaust_status).toBeUndefined();
  });

  it("exposes a stable default map for install docs", () => {
    expect(INDUSTRIAL_CABINET_MODBUS_MAP.length).toBeGreaterThanOrEqual(2);
    expect(INDUSTRIAL_CABINET_MODBUS_MAP[0]?.telemetryField).toBe("temperature_c");
  });
});
