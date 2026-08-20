/**
 * Intent flywheel: visible orchestration for failure capture → list → promote → eval.
 */
import { bindScriptRuntime } from "./lib/bind-script-runtime.js";
import { getEffectiveSettings } from "../apps/api/src/settings/store.js";
import { loadIntentFailures } from "@embodied-agent/agent";

type PendingFailure = ReturnType<typeof loadIntentFailures>[number];

function groupByFailureKind(rows: PendingFailure[]): Map<string, PendingFailure[]> {
  const groups = new Map<string, PendingFailure[]>();
  for (const row of rows) {
    const list = groups.get(row.failure_kind) ?? [];
    list.push(row);
    groups.set(row.failure_kind, list);
  }
  return groups;
}

function formatExpected(row: PendingFailure): string {
  return JSON.stringify(row.expected ?? {}, null, 0);
}

await bindScriptRuntime();
const settings = getEffectiveSettings();
const pending = loadIntentFailures().filter((row) => !row.promoted);

console.log("== intent flywheel ==");
console.log(`deployment_id: ${settings.deployment_id}`);
console.log(`pending_failures: ${pending.length}`);

if (pending.length === 0) {
  console.log("No pending intent failures.");
} else {
  console.log("pending by failure_kind:");
  for (const [kind, rows] of groupByFailureKind(pending)) {
    console.log(`- ${kind}: ${rows.length}`);
  }
  console.log("pending failures:");
  for (const row of pending) {
    console.log(
      [`id=${row.id}`, `utterance=${row.utterance}`, `failure_kind=${row.failure_kind}`].join("\t"),
    );
  }
}

const hasLlmKey = Boolean(settings.llm_api_key?.trim() || process.env.LLM_API_KEY?.trim());
if (hasLlmKey) {
  console.log("LLM key detected: you can run SIM_MATRIX_SLICE=core npm run sim:matrix");
} else {
  console.log("SKIP: no LLM key; sim:matrix may be skipped per repo gate rules.");
}

console.log("next steps:");
if (pending.length === 0) {
  console.log("- no pending failures to promote");
} else {
  for (const row of pending) {
    const suggestedSkill =
      row.expected_skill ?? row.pro_skill ?? row.flash_skill ?? "clarification_needed";
    console.log(
      `- npm run intent:failures:promote -- --id ${row.id} --skill ${suggestedSkill} --expected '${formatExpected(row)}'`,
    );
  }
}
console.log("- npm run intent:failures:promote-wechat");
