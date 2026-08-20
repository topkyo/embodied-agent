import { resolveIntent } from "@embodied-agent/agent";
import {
  configureGatewayDataDir,
  GOLDEN_EVAL_PATH,
  loadDeploymentContextFromRegistry,
  loadGoldenRows,
  matchesExpectation,
  requireLlmClient,
} from "./lib/intent-eval-common.js";

const MIN_PASS = Number(process.env.INTENT_EVAL_MIN_PASS_RATE ?? "0.9");

async function main() {
  configureGatewayDataDir();
  const { client, model } = requireLlmClient();
  const deploymentContext = loadDeploymentContextFromRegistry();
  const rows = loadGoldenRows(GOLDEN_EVAL_PATH);
  let pass = 0;
  const failures: string[] = [];

  for (const row of rows) {
    const result = await resolveIntent(row.utterance, deploymentContext, client, model);
    if (!result.ok) {
      failures.push(`${row.utterance} → unavailable`);
      continue;
    }
    if (result.validation.kind === "clarification") {
      if (row.expected_skill === "clarification_needed") pass++;
      else failures.push(`${row.utterance} → unexpected clarification`);
      continue;
    }
    const raw = {
      skill: result.validation.intent.skill,
      target: result.validation.intent.target,
      parameters:
        "parameters" in result.validation.intent ? result.validation.intent.parameters : undefined,
    };
    if (row.expected_skill === "clarification_needed") {
      failures.push(`${row.utterance} → expected clarification`);
      continue;
    }
    if (matchesExpectation(row, raw)) pass++;
    else failures.push(`${row.utterance} → ${JSON.stringify(raw)}`);
  }

  const rate = pass / rows.length;
  console.log(`Intent eval: ${pass}/${rows.length} (${(rate * 100).toFixed(1)}%)`);
  if (failures.length) {
    console.log("Failures (first 10):");
    failures.slice(0, 10).forEach((f) => console.log(" -", f));
  }
  if (rate < MIN_PASS) process.exit(1);
}

main();
