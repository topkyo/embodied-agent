import { createIntentResolver } from "@embodied-agent/agent";
import {
  configureGatewayDataDir,
  loadDeploymentContextFromRegistry,
  loadMatrixSlices,
  matchesExpectation,
  requireLlmClient,
} from "./lib/intent-eval-common.js";
import { bindScriptRuntime, getScriptAgentRuntimeContext } from "./lib/bind-script-runtime.js";

async function main(): Promise<void> {
  await bindScriptRuntime();
  const resolver = createIntentResolver(getScriptAgentRuntimeContext());
  configureGatewayDataDir();
  const ids = (process.env.SPOT_IDS ?? "43,74")
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));

  const rows = loadMatrixSlices().core.filter((r) => ids.includes(r.id));
  const deps = requireLlmClient();
  const ctx = loadDeploymentContextFromRegistry();

  let passed = 0;
  for (const row of rows) {
    const { result } = await resolver.resolveWithEscalation(
      row.utterance,
      ctx,
      { llmClient: deps.client, model: deps.model },
      { history: row.history },
    );
    const ok =
      result.ok &&
      result.validation.kind === "intent" &&
      matchesExpectation(result.validation.intent, row);
    if (ok) passed++;
    const actual = result.ok
      ? result.validation.kind === "intent"
        ? result.validation.intent.skill
        : result.validation.message?.slice(0, 80)
      : "LLM unavailable";
    console.log(`#${row.id} ${ok ? "PASS" : "FAIL"} ${row.utterance} -> ${actual}`);
  }

  console.log(`spot-check ${passed}/${rows.length}`);
  process.exit(passed === rows.length ? 0 : 1);
}

void main();
