import {
  getDomainPackCatalog,
  evaluateDomainPackReadinessFromContract,
  preloadAllDomainPacksForReadiness,
  resolveDomainPackContractById,
} from "../apps/api/src/domain-packs/loader.js";
import { bindScriptRuntime, getScriptPlatformRuntimeContext } from "./lib/bind-script-runtime.js";

await bindScriptRuntime();
const scriptCtx = getScriptPlatformRuntimeContext();
await preloadAllDomainPacksForReadiness(scriptCtx.loader);

const results = getDomainPackCatalog(scriptCtx.loader).map((entry) =>
  evaluateDomainPackReadinessFromContract(
    scriptCtx,
    resolveDomainPackContractById(scriptCtx.loader, entry.id),
  ),
);
const failures: string[] = [];

for (const result of results) {
  const status = result.deliverable ? "READY" : result.readiness.toUpperCase();
  console.log(
    `${status} ${result.pack_id}: golden=${result.eval.golden_rows} extra=${result.eval.matrix_extra_rows} wechat=${result.eval.matrix_wechat_rows} negative=${result.eval.matrix_negative_rows}`,
  );
  for (const issue of result.issues) {
    console.log(`  - ${issue.severity}: ${issue.code} ${issue.message}`);
  }
  if (result.status === "live" && !result.deliverable) {
    failures.push(`${result.pack_id} live pack is not deliverable`);
  }
  if (result.status === "placeholder" && result.deliverable) {
    failures.push(`${result.pack_id} placeholder pack must not be deliverable`);
  }
}

if (failures.length > 0) {
  console.error("[check-domain-pack-readiness] failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
