import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

type StubOptions = {
  port?: number;
  host?: string;
  delayMs?: number;
  failPaths?: string[];
};

export type M20StubRequest = {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
  at: string;
};

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function dataFor(pathname: string, query: URLSearchParams, body: unknown): unknown {
  if (pathname === "/body/status") {
    return { robot_id: "m20-001", power_percent: 82, motion_state: "stand", fault: null };
  }
  if (pathname === "/body/sensors") {
    return { imu: "ok", battery: "ok", temperature_c: 38.2 };
  }
  if (pathname === "/body/obstacle") {
    return { front_m: 2.4, left_m: 1.8, right_m: 2.1 };
  }
  if (pathname === "/body/nav/pose") {
    return { map_id: "stub-map", x: 1.2, y: 3.4, yaw: 0.12 };
  }
  if (pathname === "/body/nav/status") {
    return { state: "idle", waypoint_id: null, progress_percent: 0 };
  }
  if (pathname === "/vision/capture" || pathname === "/gimbal/capture") {
    return {
      source: query.get("source") ?? query.get("mode") ?? "body",
      image_url: "http://127.0.0.1:3099/static/capture.jpg",
      captured_at: new Date().toISOString(),
    };
  }
  if (pathname === "/vision/inspect") {
    const row = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const waypointId = String(row.waypoint_id ?? "unknown");
    const source = row.source === "gimbal" ? "gimbal" : "body";
    const blocked =
      waypointId === "dock" || waypointId.includes("gate") || waypointId.includes("blocked");
    return {
      source_kind: "stub",
      source,
      waypoint_id: waypointId,
      image_url: `http://127.0.0.1:3099/static/inspect-${waypointId}.jpg`,
      captured_at: new Date().toISOString(),
      summary: blocked ? "通道前方疑似有障碍物。" : "巡检点位未见明显异常。",
      anomalies: blocked
        ? [
            {
              kind: "blocked_path",
              severity: "L2",
              description: "巡检图像显示通道被物体遮挡。",
              confidence: 0.91,
            },
          ]
        : [],
    };
  }
  if (pathname === "/vision/stream-url") {
    return { stream_url: "rtsp://127.0.0.1:8554/m20-stub", source: query.get("source") ?? "body" };
  }
  if (pathname === "/speaker/status") {
    return { online: true, volume: 60, playing: false };
  }
  if (pathname === "/speaker/device-info") {
    return { model: "m20-speaker-stub", firmware: "stub" };
  }
  if (pathname === "/gimbal/ptz/attitude") {
    return { yaw: 0, pitch: -5, roll: 0 };
  }
  if (pathname === "/gimbal/laser/range") {
    return { distance_m: 4.2, confidence: 0.93 };
  }
  return { accepted: true, path: pathname, query: Object.fromEntries(query.entries()), body };
}

export async function startM20Stub(opts: StubOptions = {}): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
  requests: () => readonly M20StubRequest[];
  clearRequests: () => void;
  setDelayMs: (ms: number) => void;
  setFailPaths: (paths: string[]) => void;
}> {
  const host = opts.host ?? "127.0.0.1";
  let delayMs = opts.delayMs ?? 0;
  let failPaths = new Set(opts.failPaths ?? []);
  const requests: M20StubRequest[] = [];
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:0`}`);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      if (req.destroyed || res.destroyed) return;
      const body = await readBody(req);
      requests.push({
        method: req.method ?? "GET",
        path: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        body,
        at: new Date().toISOString(),
      });
      if (res.destroyed) return;
      if (failPaths.has(url.pathname) || failPaths.has("*")) {
        sendJson(res, 500, { success: false, code: 500, message: `stub failure: ${url.pathname}` });
        return;
      }
      sendJson(res, 200, {
        success: true,
        code: 0,
        data: dataFor(url.pathname, url.searchParams, body),
      });
    } catch (e) {
      if (res.destroyed || req.destroyed) return;
      sendJson(res, 500, {
        success: false,
        code: 500,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, host, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("m20 stub listen failed");
  return {
    baseUrl: `http://${host}:${address.port}`,
    requests: () => requests,
    clearRequests: () => {
      requests.length = 0;
    },
    setDelayMs: (ms: number) => {
      delayMs = ms;
    },
    setFailPaths: (paths: string[]) => {
      failPaths = new Set(paths);
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number.parseInt(process.env.M20_STUB_PORT ?? "3099", 10);
  const delayMs = Number.parseInt(process.env.M20_STUB_DELAY_MS ?? "0", 10);
  const failPaths = (process.env.M20_STUB_FAIL_PATHS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const stub = await startM20Stub({ port, delayMs, failPaths });
  console.log(`M20 stub listening at ${stub.baseUrl}`);
}
