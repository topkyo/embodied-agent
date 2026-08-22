/**
 * List / promote pilot intent failures into golden eval set.
 *
 *   npm run intent:failures:list
 *   npm run intent:failures:promote -- --id f-abc --skill alert.set_threshold --expected '{"target":{"greenhouse_id":"gh-002"},"parameters":{"metric":"temperature_c","operator":">","value":30}}'
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { resolveAgentDataDir } from "@embodied-agent/platform";
import { getEffectiveSettings } from "../apps/api/src/settings/store.js";
import { getPrimaryDomainPackContract } from "../apps/api/src/domain-packs/loader.js";
import {
  bindScriptRuntime,
  getScriptAgentRuntimeContext,
  getScriptPlatformRuntimeContext,
} from "./lib/bind-script-runtime.js";
import { loadIntentFailures, markFailurePromoted } from "@embodied-agent/agent";

const PROMOTE_EVAL_TIMEOUT_MS = 300_000;

await bindScriptRuntime();
const agentBindings = getScriptAgentRuntimeContext().bindings;
const { GOLDEN_EVAL_PATH, loadGoldenRows } = await import("./lib/intent-eval-common.js");

const goldenPath = GOLDEN_EVAL_PATH;

function goldenHasUtterance(utterance: string): boolean {
  if (!existsSync(goldenPath)) return false;
  return loadGoldenRows(goldenPath).some((row) => row.utterance === utterance);
}

function hasConfiguredApiKey(): boolean {
  if (process.env.LLM_API_KEY) return true;
  const settingsPath = resolve(resolveAgentDataDir(), "settings.json");
  if (!existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      llm_api_key?: string;
    };
    return Boolean(settings.llm_api_key?.trim());
  } catch {
    return false;
  }
}

function runIntentEvalGate(): { ok: boolean; output: string } {
  const result = spawnSync("tsx", ["scripts/run-intent-eval.ts"], {
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: PROMOTE_EVAL_TIMEOUT_MS,
  });
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--id" && argv[i + 1]) out.id = argv[++i];
    if (argv[i] === "--skill" && argv[i + 1]) out.skill = argv[++i];
    if (argv[i] === "--expected" && argv[i + 1]) out.expected = argv[++i];
  }
  return out;
}

function getPromoteAllowedSkills(): string[] {
  const settings = getEffectiveSettings();
  const contract = getPrimaryDomainPackContract(getScriptPlatformRuntimeContext().loader, settings);
  return [...contract.core.skills.p0, ...contract.core.skills.p1];
}

function listFailures(): void {
  const rows = loadIntentFailures(agentBindings).filter((r) => !r.promoted);
  if (rows.length === 0) {
    console.log("No pending intent failures.");
    return;
  }
  for (const r of rows) {
    console.log(
      [
        `id=${r.id}`,
        `at=${r.recorded_at}`,
        `utterance=${r.utterance}`,
        `error=${r.error ?? ""}`,
      ].join("\t"),
    );
  }
}

function promote(id: string, skill: string, expectedJson: string): void {
  const allowedSkills = getPromoteAllowedSkills();
  if (skill !== "clarification_needed" && !allowedSkills.includes(skill)) {
    console.error(
      `Invalid skill: ${skill}. Must be one of: ${allowedSkills.join(", ")}, clarification_needed`,
    );
    process.exit(1);
  }
  const row = loadIntentFailures(agentBindings).find((r) => r.id === id);
  if (!row) {
    console.error(`Unknown failure id: ${id}`);
    process.exit(1);
  }
  if (row.promoted) {
    console.error(`Already promoted: ${id}`);
    process.exit(1);
  }
  if (goldenHasUtterance(row.utterance)) {
    console.error(`Golden already contains utterance: ${row.utterance}`);
    process.exit(1);
  }
  let expected: { target?: Record<string, unknown>; parameters?: Record<string, unknown> };
  try {
    expected = JSON.parse(expectedJson) as typeof expected;
  } catch {
    console.error("--expected must be valid JSON");
    process.exit(1);
  }
  const golden = {
    utterance: row.utterance,
    expected_skill: skill,
    expected,
  };
  const previousGolden = existsSync(goldenPath) ? readFileSync(goldenPath, "utf8") : "";
  writeFileSync(goldenPath, `${previousGolden}${JSON.stringify(golden)}\n`, "utf8");
  if (!hasConfiguredApiKey()) {
    console.warn(
      "WARNING: no LLM API key configured; promote_dest=golden_without_gate, eval gate skipped",
    );
    markFailurePromoted(agentBindings, id, "golden_without_gate");
    console.log(`Promoted ${id} → ${goldenPath} (golden_without_gate)`);
    return;
  }
  const { ok, output } = runIntentEvalGate();
  if (!ok) {
    writeFileSync(goldenPath, previousGolden, "utf8");
    console.error(output.trimEnd());
    console.error("golden eval gate failed, promote rolled back");
    process.exit(1);
  }
  markFailurePromoted(agentBindings, id);
  console.log(`Promoted ${id} → ${goldenPath}`);
}

const args = process.argv.slice(2);
if (args.includes("--list") || args.length === 0) {
  listFailures();
  process.exit(0);
}

const { id, skill, expected } = parseArgs(args);
if (!id || !skill || !expected) {
  console.error("Usage: promote-intent-failures.ts --id <id> --skill <skill> --expected '<json>'");
  process.exit(1);
}
promote(id, skill, expected);
