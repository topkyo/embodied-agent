import { getEffectiveSettings } from "../apps/api/src/settings/store.js";
import { getPrimaryDomainPackContract } from "../apps/api/src/domain-packs/loader.js";
import { bindScriptRuntime, getScriptPlatformRuntimeContext } from "./lib/bind-script-runtime.js";
import { createLlmClientFromSettings } from "./lib/intent-eval-common.js";
import { LlmUnavailableError } from "@embodied-agent/agent";

const printOnly = process.argv.includes("--print");
const adapterArgs = process.argv.slice(2).filter((arg) => arg !== "--" && arg !== "--print");
const allowSkip = adapterArgs.includes("--allow-skip");

type DomainFlywheelAdapter = {
  runDomainFlywheel?: (args?: string[]) => Promise<void> | void;
};

await bindScriptRuntime();

if (allowSkip) {
  try {
    createLlmClientFromSettings();
  } catch (e) {
    if (e instanceof LlmUnavailableError) {
      console.log("SKIP: LLM 未配置");
      console.log(JSON.stringify({ skipped_reason: "llm_unavailable" }));
      process.exit(0);
    }
    throw e;
  }
}

const settings = getEffectiveSettings();
const contract = getPrimaryDomainPackContract(getScriptPlatformRuntimeContext().loader, settings);
const gate = contract.core.readiness?.flywheelGate;

if (!gate?.adapterModule.trim()) {
  throw new Error(
    `Domain Pack ${contract.core.manifest.id} 未声明 runtimeReadiness.flywheelGate.adapterModule`,
  );
}

if (printOnly) {
  console.log(
    JSON.stringify(
      {
        active_domain: contract.core.manifest.id,
        deployment_id: settings.deployment_id,
        adapterModule: gate.adapterModule,
        description: gate.description,
        reportPath: gate.reportPath,
        requiredServices: gate.requiredServices ?? [],
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log(`== domain flywheel: ${contract.core.manifest.id} ==`);
console.log(gate.description);
console.log(`adapter: ${gate.adapterModule}`);
process.env.ACTIVE_DOMAIN = contract.core.manifest.id;
process.env.DEPLOYMENT_ID = settings.deployment_id;

const adapter = (await import(gate.adapterModule)) as DomainFlywheelAdapter;
if (typeof adapter.runDomainFlywheel !== "function") {
  throw new Error(`${gate.adapterModule} 未导出 runDomainFlywheel()`);
}
await adapter.runDomainFlywheel(adapterArgs);
