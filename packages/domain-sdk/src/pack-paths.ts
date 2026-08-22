import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type { DomainPackManifest } from "@embodied-agent/core";

/**
 * 从 pack 模块自身的 import.meta.url 解析 Domain Pack 包根目录。
 * 语义与各 pack.ts 原本地实现一致：createRequire(importMetaUrl) 后
 * require.resolve("<packageName>/package.json") 取 dirname。
 */
export function packRootFromModuleUrl(importMetaUrl: string, packageName: string): string {
  const require = createRequire(importMetaUrl);
  return dirname(require.resolve(`${packageName}/package.json`));
}

/** 把 manifest 里的相对 eval 路径解析为以 packRoot 为基准的绝对路径。 */
export function resolvePackEvalPaths(
  packRoot: string,
  relative: DomainPackManifest["eval"],
): DomainPackManifest["eval"] {
  return {
    golden: resolve(packRoot, relative.golden),
    matrixExtra: resolve(packRoot, relative.matrixExtra),
    matrixWechat: resolve(packRoot, relative.matrixWechat),
    matrixNegative: resolve(packRoot, relative.matrixNegative),
  };
}
