type M20ApiResponse<T = unknown> = {
  code?: number;
  success?: boolean;
  message?: string;
  data?: T;
};

export type RobotWaypoint = {
  waypoint_id: string;
  name?: string;
  points: Array<Record<string, unknown>>;
};

export type M20ClientConfig = {
  m20_base_url?: string;
  default_robot_id?: string;
  waypoints?: RobotWaypoint[];
  timeout_ms?: number;
};

export type M20InspectionEvidence = {
  source_kind?: "stub" | "m20";
  image_url?: string;
  captured_at?: string;
  summary?: string;
  anomalies?: Array<{
    kind: "blocked_path" | "hotspot" | "person_risk";
    severity?: "L1" | "L2";
    description?: string;
    confidence?: number;
  }>;
};

export class M20HttpError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "M20HttpError";
  }
}

const DEFAULT_M20_TIMEOUT_MS = 8_000;

function m20TimeoutMs(config: M20ClientConfig): number {
  if (typeof config.timeout_ms === "number" && config.timeout_ms > 0) return config.timeout_ms;
  const raw = Number.parseInt(process.env.M20_HTTP_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_M20_TIMEOUT_MS;
}

export function m20BaseUrl(config: M20ClientConfig): string {
  const url = config.m20_base_url?.trim();
  if (!url) {
    throw new M20HttpError(
      "robot 场景缺少 domain_configs.robotics.m20_base_url。",
      "m20_config_missing",
    );
  }
  return url.replace(/\/+$/, "");
}

export function defaultRobotId(config: M20ClientConfig): string {
  const robotId = config.default_robot_id?.trim();
  if (!robotId) {
    throw new M20HttpError(
      "robot 场景缺少 domain_configs.robotics.default_robot_id。",
      "m20_config_missing",
    );
  }
  return robotId;
}

export function resolveRobotWaypoint(config: M20ClientConfig, waypoint_id: string): RobotWaypoint {
  const waypoints = config.waypoints ?? [];
  const hit = waypoints.find((w) => w.waypoint_id === waypoint_id);
  if (!hit) {
    throw new Error(`未配置机器人点位：${waypoint_id}`);
  }
  return hit;
}

async function requestM20<T>(
  config: M20ClientConfig,
  path: string,
  opts?: { method?: "GET" | "POST"; body?: unknown },
): Promise<T> {
  const method = opts?.method ?? "GET";
  defaultRobotId(config);
  const controller = new AbortController();
  const timeout = m20TimeoutMs(config);
  const timer = setTimeout(() => controller.abort(), timeout);
  let res: Response;
  try {
    res = await fetch(`${m20BaseUrl(config)}${path}`, {
      method,
      headers: opts?.body ? { "Content-Type": "application/json" } : undefined,
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      throw new M20HttpError(`M20 HTTP 请求超时（${timeout}ms）：${method} ${path}`, "m20_timeout");
    }
    throw new M20HttpError(
      `M20 HTTP 请求失败：${e instanceof Error ? e.message : String(e)}`,
      "m20_network_error",
      undefined,
      { path, method },
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let payload: M20ApiResponse<T> | T;
  try {
    payload = text ? (JSON.parse(text) as M20ApiResponse<T> | T) : ({} as T);
  } catch {
    payload = text as T;
  }
  if (!res.ok) {
    throw new M20HttpError(
      `M20 HTTP ${res.status}: ${text || res.statusText}`,
      "m20_http_error",
      res.status,
      payload,
    );
  }
  if (payload && typeof payload === "object" && ("success" in payload || "code" in payload)) {
    const wrapped = payload as M20ApiResponse<T>;
    if (wrapped.success === false || (wrapped.code != null && wrapped.code !== 0)) {
      throw new M20HttpError(
        wrapped.message || `M20 API 返回错误 code=${wrapped.code}`,
        "m20_api_error",
        res.status,
        wrapped,
      );
    }
    return wrapped.data as T;
  }
  return payload as T;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) sp.set(key, String(value));
  }
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export function createM20Client(readConfig: () => M20ClientConfig) {
  const request = <T>(
    path: string,
    opts?: { method?: "GET" | "POST"; body?: unknown },
  ): Promise<T> => requestM20<T>(readConfig(), path, opts);
  return {
    bodyStatus: () => request("/body/status"),
    sensors: () => request("/body/sensors"),
    obstacle: () => request("/body/obstacle"),
    pose: () => request("/body/nav/pose"),
    navStatus: () => request("/body/nav/status"),
    capture: (source = "body") => request(`/vision/capture${qs({ source })}`, { method: "POST" }),
    inspect: (params: { waypoint_id: string; source?: "body" | "gimbal"; objective?: string }) =>
      request<M20InspectionEvidence>("/vision/inspect", {
        method: "POST",
        body: {
          waypoint_id: params.waypoint_id,
          source: params.source ?? "body",
          objective: params.objective ?? "巡检取证",
        },
      }),
    streamUrl: (source = "body") => request(`/vision/stream-url${qs({ source })}`),
    standUp: () => request("/body/motion-state", { method: "POST", body: { state: 1 } }),
    sitDown: () => request("/body/motion-state", { method: "POST", body: { state: 4 } }),
    move: (params: {
      x?: number;
      y?: number;
      yaw?: number;
      duration_ms?: number;
      distance_m?: number;
    }) =>
      request("/body/move", {
        method: "POST",
        body: {
          X: params.x ?? 0,
          Y: params.y ?? 0,
          Z: 0,
          Roll: 0,
          Pitch: 0,
          Yaw: params.yaw ?? 0,
          durationMs: params.duration_ms ?? 1000,
          intervalMs: 50,
          distanceM: params.distance_m ?? 0,
        },
      }),
    setGait: (gait: number) => request("/body/gait", { method: "POST", body: { GaitParam: gait } }),
    setMotionMode: (mode: number) =>
      request("/body/mode", { method: "POST", body: { Mode: mode } }),
    navStart: (points: Array<Record<string, unknown>>) =>
      request("/body/nav/start", { method: "POST", body: { Points: points } }),
    navCancel: () => request("/body/nav/cancel", { method: "POST" }),
    speak: (text: string, voice?: "male" | "female") =>
      request(`/speaker/tts/v2${qs({ text, voice: voice === "female" ? 1 : 0 })}`, {
        method: "POST",
      }),
    speakerStatus: () => request("/speaker/status"),
    speakerDeviceInfo: () => request("/speaker/device-info"),
    setVolume: (volume: number) => request(`/speaker/volume${qs({ volume })}`, { method: "POST" }),
    playAudio: (fileName: string, loop = false) =>
      request(`/speaker/play${qs({ fileName, loop })}`, { method: "POST" }),
    stopAudio: () => request("/speaker/stop", { method: "POST" }),
    setSpeakerPitch: (pitchValue: number) =>
      request(`/speaker/pitch${qs({ pitchValue })}`, { method: "POST" }),
    lightOn: () => request("/four-in-one/light/on", { method: "POST" }),
    lightOff: () => request("/four-in-one/light/off", { method: "POST" }),
    setBrightness: (brightness: number) =>
      request(`/four-in-one/light/brightness${qs({ brightness })}`, {
        method: "POST",
      }),
    strobeOn: () => request("/four-in-one/strobe/on", { method: "POST" }),
    strobeOff: () => request("/four-in-one/strobe/off", { method: "POST" }),
    setRbMode: (mode: number) => request(`/four-in-one/rb-mode${qs({ mode })}`, { method: "POST" }),
    bodyLed: (state: "on" | "off" = "on") =>
      request("/body/led", {
        method: "POST",
        body: { Front: state === "on" ? 1 : 0, Back: state === "on" ? 1 : 0 },
      }),
    setBodyLed: (front: number, back: number) =>
      request("/body/led", { method: "POST", body: { Front: front, Back: back } }),
    playAlarm: () => request("/speaker/alarm/play", { method: "POST" }),
    stopAlarm: () => request("/speaker/alarm/stop", { method: "POST" }),
    gimbalAttitude: () => request("/gimbal/ptz/attitude"),
    gimbalMove: (direction: "up" | "down" | "left" | "right", durationMs = 3000) =>
      request(`/gimbal/ptz/move${qs({ direction, durationMs })}`, { method: "POST" }),
    gimbalAngle: (params: {
      yaw?: number;
      pitch?: number;
      speed?: number;
      use_gyro?: boolean;
      duration_ms?: number;
    }) =>
      request(
        `/gimbal/ptz/angle${qs({
          yaw: params.yaw ?? 0,
          pitch: params.pitch ?? 0,
          speed: params.speed ?? 5,
          useGyro: params.use_gyro !== false,
          durationMs: params.duration_ms ?? 3000,
        })}`,
        { method: "POST" },
      ),
    gimbalCenter: () => request("/gimbal/ptz/center", { method: "POST" }),
    gimbalStop: () => request("/gimbal/ptz/stop", { method: "POST" }),
    gimbalLock: () => request("/gimbal/ptz/lock", { method: "POST" }),
    gimbalFollow: () => request("/gimbal/ptz/follow", { method: "POST" }),
    gimbalZoom: (action: "in" | "out" | "stop", position?: number) =>
      position === undefined
        ? request(`/gimbal/zoom${qs({ action })}`, { method: "POST" })
        : request(`/gimbal/zoom/position${qs({ position })}`, { method: "POST" }),
    gimbalFocus: (action: "near" | "far" | "stop") =>
      request(`/gimbal/focus${qs({ action })}`, { method: "POST" }),
    gimbalAutoFocus: () => request("/gimbal/focus/auto", { method: "POST" }),
    gimbalRecordStart: () => request("/gimbal/record/start", { method: "POST" }),
    gimbalRecordStop: () => request("/gimbal/record/stop", { method: "POST" }),
    gimbalCapture: (mode: "both" | "visible" | "thermal" = "both") =>
      request(`/gimbal/capture${qs({ mode })}`, { method: "POST" }),
    gimbalThermalPalette: (palette: number) =>
      request(`/gimbal/thermal/palette${qs({ palette })}`, { method: "POST" }),
    gimbalLaserRange: () => request("/gimbal/laser/range", { method: "POST" }),
  };
}

export type M20Client = ReturnType<typeof createM20Client>;
