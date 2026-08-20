/**
 * 轻量 iLink QR 状态机 mock，供 E2E / 本地契约验证。
 * 设 ILINK_BASE_URL=http://127.0.0.1:${ILINK_MOCK_PORT} 指向本服务。
 * ILINK_MOCK_PORT=0 时自动分配空闲端口，并写入 ILINK_MOCK_PORT_FILE 供 e2e-api-server 读取。
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { writeFileSync } from "node:fs";

const REQUESTED_PORT = Number(process.env.ILINK_MOCK_PORT ?? 18999);
const CONFIRM_AFTER_POLLS = Number(process.env.ILINK_MOCK_CONFIRM_AFTER ?? 2);
const PORT_FILE = process.env.ILINK_MOCK_PORT_FILE?.trim() || "";

export const E2E_MOCK_PLATFORM_USER = "e2e-wx-user@im.wechat";
export const E2E_MOCK_BOT_ID = "e2e-bot@im.bot";
export const E2E_MOCK_TOKEN = "e2e-bot-token";

type QrRecord = { polls: number; qrcode: string };

const qrStates = new Map<string, QrRecord>();
let listeningPort = REQUESTED_PORT;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseRequestUrl(req: IncomingMessage): URL {
  const host = req.headers.host ?? "127.0.0.1";
  return new URL(req.url ?? "/", `http://${host}`);
}

const server = createServer(async (req, res) => {
  const url = parseRequestUrl(req);
  const path = url.pathname;

  if (req.method === "GET" && path.endsWith("/ilink/bot/get_bot_qrcode")) {
    const qrcode = `qr-e2e-${Date.now()}`;
    qrStates.set(qrcode, { polls: 0, qrcode });
    return sendJson(res, 200, {
      ret: 0,
      qrcode,
      qrcode_img_content: `https://liteapp.weixin.qq.com/q/${encodeURIComponent(qrcode)}`,
    });
  }

  if (req.method === "GET" && path.endsWith("/ilink/bot/get_qrcode_status")) {
    const qrcode = url.searchParams.get("qrcode") ?? "";
    const rec = qrStates.get(qrcode) ?? { polls: 0, qrcode };
    rec.polls += 1;
    qrStates.set(qrcode, rec);

    if (rec.polls < CONFIRM_AFTER_POLLS) {
      return sendJson(res, 200, { status: "wait" });
    }

    return sendJson(res, 200, {
      status: "confirmed",
      bot_token: E2E_MOCK_TOKEN,
      ilink_bot_id: E2E_MOCK_BOT_ID,
      ilink_user_id: E2E_MOCK_PLATFORM_USER,
      baseurl: `http://127.0.0.1:${listeningPort}`,
    });
  }

  if (req.method === "POST" && path.endsWith("/ilink/bot/getupdates")) {
    await readBody(req);
    return sendJson(res, 200, { ret: 0, msgs: [], get_updates_buf: "" });
  }

  if (req.method === "POST" && path.endsWith("/ilink/bot/sendmessage")) {
    await readBody(req);
    return sendJson(res, 200, { ret: 0 });
  }

  sendJson(res, 404, { error: "not_found", path });
});

const bindPort = REQUESTED_PORT > 0 ? REQUESTED_PORT : 0;
server.listen(bindPort, "127.0.0.1", () => {
  const addr = server.address();
  if (addr && typeof addr === "object") {
    listeningPort = addr.port;
  }
  if (PORT_FILE) {
    writeFileSync(PORT_FILE, String(listeningPort), "utf8");
  }
  console.log(`[ilink-mock] listening on http://127.0.0.1:${listeningPort}`);
});
