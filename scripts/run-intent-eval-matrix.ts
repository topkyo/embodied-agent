/**
 * Run intent golden eval against multiple DeepSeek models for comparison.
 * Production gate: deepseek-v4-flash must pass INTENT_EVAL_MIN_PASS_RATE (default 90%).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveAgentDataDir } from "@embodied-agent/platform";

const MODELS = [
  { name: "deepseek-v4-flash", gate: true },
  { name: "deepseek-v4-pro", gate: false },
] as const;

const BASE_URL = process.env.LLM_BASE_URL ?? "https://api.deepseek.com/v1";

function hasConfiguredApiKey(): boolean {
  if (process.env.LLM_API_KEY) return true;
  const candidates = [resolve(resolveAgentDataDir(), "settings.json")];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const settings = JSON.parse(readFileSync(path, "utf8")) as {
        llm_api_key?: string;
      };
      if (settings.llm_api_key?.trim()) return true;
    } catch {
      // Ignore corrupt settings here; eval:intent will report the exact error.
    }
  }
  return false;
}

function runEval(model: string): { ok: boolean; output: string } {
  const r = spawnSync("npm", ["run", "eval:intent"], {
    env: {
      ...process.env,
      LLM_BASE_URL: BASE_URL,
      LLM_MODEL: model,
      LLM_THINKING: "1",
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return { ok: r.status === 0, output };
}

async function main() {
  if (!hasConfiguredApiKey()) {
    console.error(
      "SKIP: set LLM_API_KEY or save an LLM API key in Web settings to run eval:intent:matrix",
    );
    process.exit(0);
  }

  console.log("Intent eval matrix (thinking enabled)\n");
  let gateFailed = false;

  for (const { name, gate } of MODELS) {
    console.log(`=== ${name}${gate ? " [CI gate]" : ""} ===`);
    const { ok, output } = runEval(name);
    const rateLine = output.split("\n").find((l) => l.startsWith("Intent eval:"));
    console.log(rateLine ?? output.slice(-500));
    if (!ok && gate) gateFailed = true;
    console.log("");
  }

  if (gateFailed) process.exit(1);
}

main();
