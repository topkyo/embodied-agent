import type { DomainPackEvalPaths } from "@embodied-agent/core";
import {
  getConfiguredRuntimeSettings,
  resolveActiveDomainPackContracts,
  type DomainPackRuntimeSettings,
  type DomainPackLoaderHolder,
} from "./loader.js";

export type ActiveEvalConfig = {
  packIds: string[];
  goldenPaths: string[];
  matrixExtraPaths: string[];
  matrixWechatPaths: string[];
  matrixNegativePaths: string[];
};

export function resolveActiveEvalConfig(
  holder: DomainPackLoaderHolder,
  settings: Pick<DomainPackRuntimeSettings, "active_domain"> = getConfiguredRuntimeSettings(holder),
): ActiveEvalConfig {
  const contracts = resolveActiveDomainPackContracts(holder, settings);
  return {
    packIds: contracts.map((contract) => contract.core.manifest.id),
    goldenPaths: contracts.map((contract) => contract.core.eval.golden),
    matrixExtraPaths: contracts.map((contract) => contract.core.eval.matrixExtra),
    matrixWechatPaths: contracts.map((contract) => contract.core.eval.matrixWechat),
    matrixNegativePaths: contracts.map((contract) => contract.core.eval.matrixNegative),
  };
}

export function resolvePrimaryEvalPaths(
  holder: DomainPackLoaderHolder,
  settings?: Pick<DomainPackRuntimeSettings, "active_domain">,
): DomainPackEvalPaths & { packId: string } {
  const config = resolveActiveEvalConfig(holder, settings ?? getConfiguredRuntimeSettings(holder));
  const [packId] = config.packIds;
  const [golden] = config.goldenPaths;
  const [matrixExtra] = config.matrixExtraPaths;
  const [matrixWechat] = config.matrixWechatPaths;
  const [matrixNegative] = config.matrixNegativePaths;
  if (!packId || !golden || !matrixExtra || !matrixWechat || !matrixNegative) {
    throw new Error("active_domain 未解析到可用 eval 路径");
  }
  return { packId, golden, matrixExtra, matrixWechat, matrixNegative };
}
