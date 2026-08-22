/**
 * 将运行时 sim-matrix-wechat.jsonl 显式导出到仓库 eval corpus。
 *
 *   npm run intent:failures:export-wechat
 *   npm run intent:failures:export-wechat -- --apply
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { bindScriptRuntime, getScriptPlatformRuntimeContext } from "./lib/bind-script-runtime.js";
import { getEffectiveSettings } from "../apps/api/src/settings/store.js";
import { resolvePrimaryEvalPaths } from "@embodied-agent/runtime";
import { loadGoldenRows } from "./lib/intent-eval-common.js";

await bindScriptRuntime();

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run") || !apply;

function runtimeWechatPath(): string {
  const raw = process.env.SIM_MATRIX_WECHAT_STAGING?.trim();
  if (raw) return raw;
  const dataRoot = process.env.AGENT_DATA_DIR?.trim();
  if (!dataRoot) {
    throw new Error("AGENT_DATA_DIR 未配置，无法导出 wechat matrix。");
  }
  return `${dataRoot}/sim-matrix-wechat.jsonl`;
}

function repoWechatPath(): string {
  const settings = getEffectiveSettings();
  if (!settings.active_domain?.trim()) {
    throw new Error("active_domain 未配置，无法定位 repo eval corpus。");
  }
  return resolvePrimaryEvalPaths(getScriptPlatformRuntimeContext().loader, settings).matrixWechat;
}

function loadRows(path: string): string[] {
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8").trim();
  if (!text) return [];
  return text.split("\n").filter(Boolean);
}

function main(): void {
  const runtimePath = runtimeWechatPath();
  const repoPath = repoWechatPath();
  const runtimeRows = loadRows(runtimePath);
  const repoUtterances = new Set(loadGoldenRows(repoPath).map((row) => row.utterance));
  const pending = runtimeRows.filter((line) => {
    const row = JSON.parse(line) as { utterance?: string };
    return row.utterance ? !repoUtterances.has(row.utterance) : false;
  });

  if (pending.length === 0) {
    console.log(`no new rows to export from ${runtimePath}`);
    return;
  }

  for (const line of pending) {
    console.log(line);
  }

  if (dryRun) {
    console.log(`dry-run: ${pending.length} new row(s) from ${runtimePath} -> ${repoPath}`);
    console.log("run npm run intent:failures:export-wechat -- --apply after review");
    return;
  }

  const sep = existsSync(repoPath) && readFileSync(repoPath, "utf8").endsWith("\n") ? "" : "\n";
  appendFileSync(repoPath, `${sep}${pending.join("\n")}\n`, "utf8");
  console.log(`exported ${pending.length} rows to ${repoPath}, please review and commit`);
}

main();
