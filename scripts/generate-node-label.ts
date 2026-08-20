#!/usr/bin/env tsx
/**
 * 生成节点标签配对 URL 与 QR（打印贴纸用）
 *
 * 用法:
 *   npx tsx scripts/generate-node-label.ts greenhouse node-gh-002-a
 *   WEB_BASE=http://192.168.1.10:5173 npx tsx scripts/generate-node-label.ts robot node-m20-001-a
 */
import QRCode from "qrcode";

const packSlug = process.argv[2]?.trim();
const nodeId = process.argv[3]?.trim();
if (!packSlug || !nodeId) {
  console.error("用法: npx tsx scripts/generate-node-label.ts <pack_slug> <node_id>");
  process.exit(1);
}

const base = process.env.WEB_BASE ?? "http://127.0.0.1:5173";
const url = `${base.replace(/\/$/, "")}/scenes/${encodeURIComponent(packSlug)}/ops/devices/pair?node_id=${encodeURIComponent(nodeId)}`;

async function main() {
  console.log("pack_slug:", packSlug);
  console.log("node_id:", nodeId);
  console.log("pair_url:", url);
  const png = await QRCode.toString(url, { type: "terminal", small: true });
  console.log("\n二维码（终端）:\n");
  console.log(png);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
