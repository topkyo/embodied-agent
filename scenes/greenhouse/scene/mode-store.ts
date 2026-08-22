import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { SceneModeState, DomainPackModeStore } from "@embodied-agent/core";

export type GreenhouseControlMode = SceneModeState & {
  greenhouse_id: string;
  mode: "night_vent" | "off";
  max_temp_c: number;
  temp_high_c: number;
  temp_low_c: number;
};

export type ModeStoreDeps = {
  dataRoot: () => string;
  atomicWriteJson: (path: string, data: unknown) => void;
};

const modes = new Map<string, GreenhouseControlMode>();
let deps: ModeStoreDeps | null = null;

function requireDeps(): ModeStoreDeps {
  if (!deps) {
    throw new Error("greenhouse mode-store 未初始化：请先调用 initGreenhouseModeStore(deps)");
  }
  return deps;
}

function storePath(): string {
  return resolve(requireDeps().dataRoot(), "domain-packs", "agriculture", "greenhouse-modes.json");
}

function persist(): void {
  const { atomicWriteJson } = requireDeps();
  const dir = dirname(storePath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  atomicWriteJson(storePath(), [...modes.values()]);
}

export function initGreenhouseModeStore(next: ModeStoreDeps): void {
  deps = next;
  modes.clear();
  hydrate();
}

function hydrate(): void {
  if (!deps) return;
  const path = storePath();
  if (!existsSync(path)) return;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (e) {
    throw new Error(
      `greenhouse mode-store 数据无法读取：${path}；${e instanceof Error ? e.message : String(e)}`,
      { cause: e },
    );
  }
  if (!Array.isArray(raw)) {
    throw new Error(`greenhouse mode-store 数据非法：${path} 必须是数组。`);
  }
  for (const row of raw) {
    const mode = row as Partial<GreenhouseControlMode>;
    if (!mode.greenhouse_id || mode.mode !== "night_vent") {
      throw new Error(`greenhouse mode-store 数据非法：${path} 包含无效 mode 记录。`);
    }
    modes.set(mode.greenhouse_id, mode as GreenhouseControlMode);
  }
}

export function resolveModeParams(params: {
  mode: "night_vent" | "off";
  max_temp_c?: number;
  temp_high_c?: number;
  temp_low_c?: number;
  until_iso?: string;
}): Pick<
  GreenhouseControlMode,
  "mode" | "max_temp_c" | "temp_high_c" | "temp_low_c" | "until_iso"
> {
  if (params.mode === "off") {
    return {
      mode: "off",
      max_temp_c: 0,
      temp_high_c: 0,
      temp_low_c: 0,
      until_iso: undefined,
    };
  }
  const high = params.temp_high_c ?? params.max_temp_c ?? 30;
  const low = params.temp_low_c ?? high - 2;
  return {
    mode: "night_vent",
    max_temp_c: params.max_temp_c ?? high,
    temp_high_c: high,
    temp_low_c: low,
    until_iso: params.until_iso,
  };
}

export function setGreenhouseMode(
  greenhouse_id: string,
  user_id: string,
  params: {
    mode: "night_vent" | "off";
    max_temp_c?: number;
    temp_high_c?: number;
    temp_low_c?: number;
    until_iso?: string;
  },
): GreenhouseControlMode {
  const resolved = resolveModeParams(params);
  const row: GreenhouseControlMode = {
    entity_id: greenhouse_id,
    greenhouse_id,
    ...resolved,
    updated_at: new Date().toISOString(),
    updated_by: user_id,
  };
  if (resolved.mode === "off") {
    modes.delete(greenhouse_id);
    persist();
    return row;
  }
  modes.set(greenhouse_id, row);
  persist();
  return row;
}

export function getGreenhouseMode(greenhouse_id: string): GreenhouseControlMode | undefined {
  return modes.get(greenhouse_id);
}

export function resetGreenhouseModesForTests(): void {
  modes.clear();
  if (!deps) return;
  const path = storePath();
  if (existsSync(path)) {
    requireDeps().atomicWriteJson(path, []);
  }
}

export function createGreenhouseModeStore(): DomainPackModeStore {
  return {
    getMode(entityId) {
      return getGreenhouseMode(entityId);
    },
    setMode(entityId, userId, params) {
      return setGreenhouseMode(entityId, userId, params as Parameters<typeof setGreenhouseMode>[2]);
    },
    resetForTests: resetGreenhouseModesForTests,
  };
}
