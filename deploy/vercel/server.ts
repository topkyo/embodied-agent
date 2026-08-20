import type { IncomingMessage, ServerResponse } from "node:http";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/api/server", "http://localhost");
  const path = url.searchParams.get("path") ?? "";
  url.searchParams.delete("path");
  request.url = `/${path}${url.search}`;

  const mod = await import("../../apps/api/src/vercel-function.js");
  return mod.default(request, response);
}
