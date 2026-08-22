/**
 * 高置信失败案例 → sim-matrix-wechat.jsonl（R1–R3）+ wechat slice 验证。
 *
 *   npm run intent:failures:promote-wechat
 *   npm run intent:failures:promote-wechat -- --dry-run
 */
import { promoteCasesToWechat } from "@embodied-agent/agent";
import { bindScriptRuntime } from "./lib/bind-script-runtime.js";

await bindScriptRuntime();

const dryRun = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  const result = await promoteCasesToWechat({ dryRun, stdioInherit: true });
  for (const r of result.results) {
    if (r.status === "skipped") {
      console.log(`skip duplicate utterance: ${r.utterance}`);
    } else if (r.status === "dry_run") {
      console.log(`dry-run promote ${r.id} → wechat: ${r.utterance}`);
    } else if (r.status === "promoted") {
      console.log(`promoted ${r.id} → wechat: ${r.utterance}`);
    } else if (r.status === "failed") {
      console.error(`failed ${r.id}: ${r.error ?? "unknown"}`);
    }
  }

  if (result.promoted > 0) {
    console.log(`Promoted ${result.promoted} case(s) to wechat matrix`);
  } else if (result.results.length === 0) {
    console.log("No high-confidence cases ready for wechat promote.");
  } else if (dryRun) {
    console.log("dry-run done");
  }

  if (!result.ok) {
    console.error(result.error ?? "promote failed");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
