import { createHmac } from "node:crypto";

export function buildIflytekWsUrl(opts: {
  host: string;
  path: string;
  apiKey: string;
  apiSecret: string;
}): string {
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${opts.host}\ndate: ${date}\nGET ${opts.path} HTTP/1.1`;
  const signature = createHmac("sha256", opts.apiSecret).update(signatureOrigin).digest("base64");
  const authorizationOrigin = `api_key="${opts.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString("base64");
  const params = new URLSearchParams({
    authorization,
    date,
    host: opts.host,
  });
  return `wss://${opts.host}${opts.path}?${params.toString()}`;
}
