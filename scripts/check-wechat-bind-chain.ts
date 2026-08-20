/**
 * 微信绑定链契约门禁：Web 扫码 → platform-bindings → wechat-bridge 语音解析须同构。
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const failures: string[] = [];

function mustContain(relPath: string, pattern: RegExp, label: string): void {
  const text = readFileSync(resolve(root, relPath), "utf8");
  if (!pattern.test(text)) {
    failures.push(`${label}: ${relPath} 缺少 ${pattern}`);
  }
}

function mustExist(relPath: string, label: string): void {
  if (!existsSync(resolve(root, relPath))) {
    failures.push(`${label}: 缺少文件 ${relPath}`);
  }
}

mustContain(
  "apps/api/src/wechat/ilink-login.ts",
  /bindWechatPlatformUser/,
  "扫码确认须调用 bindWechatPlatformUser",
);
mustContain(
  "apps/api/src/wechat/ilink-bridge.ts",
  /resolveWechatPrincipal/,
  "消息桥须经 resolveWechatPrincipal 解析",
);
mustContain(
  "apps/api/src/routes/integration.ts",
  /resolveWechatPrincipal/,
  "integration 微信路由须经 resolveWechatPrincipal",
);
mustContain(
  "apps/api/src/auth/ensure-principal.ts",
  /ensurePrincipalUser/,
  "须支持 principal 自动建档",
);
mustContain(
  "apps/api/src/wechat/wechat-bind-chain.test.ts",
  /advanceWechatLogin confirmed/,
  "须有扫码 confirmed 全路径契约测试",
);
mustExist("scripts/ilink-mock-server.ts", "须有 ilink mock server");

if (failures.length > 0) {
  console.error("check-wechat-bind-chain failed:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}

console.log("check-wechat-bind-chain: ok");
