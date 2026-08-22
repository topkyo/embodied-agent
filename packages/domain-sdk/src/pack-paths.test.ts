import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { packRootFromModuleUrl, resolvePackEvalPaths } from "./pack-paths.js";

const FAKE_PACKAGE = "@test/fake-domain-pack";

// require.resolve 返回 realpath，macOS 上 tmpdir 是 /var → /private/var 符号链接
const tmpRoot = realpathSync(mkdtempSync(join(tmpdir(), "domain-sdk-pack-paths-")));
const fakePackRoot = join(tmpRoot, "node_modules", "@test", "fake-domain-pack");
mkdirSync(fakePackRoot, { recursive: true });
writeFileSync(
  join(fakePackRoot, "package.json"),
  JSON.stringify({ name: FAKE_PACKAGE, version: "0.0.0" }),
);
const moduleUrl = pathToFileURL(join(tmpRoot, "scene", "pack.ts")).href;
mkdirSync(join(tmpRoot, "scene"), { recursive: true });

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("packRootFromModuleUrl", () => {
  it("解析 packageName 的包根目录", () => {
    expect(packRootFromModuleUrl(moduleUrl, FAKE_PACKAGE)).toBe(fakePackRoot);
  });

  it("与各 pack.ts 下沉前的本地实现逐字节一致", () => {
    // 下沉前实现：const require = createRequire(import.meta.url);
    // dirname(require.resolve("<pkg>/package.json"))
    const legacyRequire = createRequire(moduleUrl);
    const legacyRoot = dirname(legacyRequire.resolve(`${FAKE_PACKAGE}/package.json`));
    expect(packRootFromModuleUrl(moduleUrl, FAKE_PACKAGE)).toBe(legacyRoot);
  });
});

describe("resolvePackEvalPaths", () => {
  const relative = {
    golden: "eval/golden.jsonl",
    matrixExtra: "eval/matrix-extra.jsonl",
    matrixWechat: "eval/matrix-wechat.jsonl",
    matrixNegative: "eval/matrix-negative.jsonl",
  };

  it("以 packRoot 为基准解析为绝对路径", () => {
    const resolved = resolvePackEvalPaths(fakePackRoot, relative);
    expect(resolved).toEqual({
      golden: join(fakePackRoot, "eval", "golden.jsonl"),
      matrixExtra: join(fakePackRoot, "eval", "matrix-extra.jsonl"),
      matrixWechat: join(fakePackRoot, "eval", "matrix-wechat.jsonl"),
      matrixNegative: join(fakePackRoot, "eval", "matrix-negative.jsonl"),
    });
  });

  it("与下沉前的本地实现逐字节一致", () => {
    // 下沉前实现：对四个字段分别 resolve(packRoot(), relative.<key>)
    const legacy = {
      golden: resolve(fakePackRoot, relative.golden),
      matrixExtra: resolve(fakePackRoot, relative.matrixExtra),
      matrixWechat: resolve(fakePackRoot, relative.matrixWechat),
      matrixNegative: resolve(fakePackRoot, relative.matrixNegative),
    };
    expect(resolvePackEvalPaths(fakePackRoot, relative)).toEqual(legacy);
  });
});
