import { evaluateSimMatrixReportEvidence } from "@embodied-agent/runtime";
import { resolveActiveEvalConfig } from "@embodied-agent/runtime";
import { getEffectiveSettings } from "../apps/api/src/settings/store.js";
import {
  activeDomainConfig,
  activeDomainId,
  configureGatewayDataDir,
} from "./lib/intent-eval-common.js";
import { bindScriptRuntime, getScriptPlatformRuntimeContext } from "./lib/bind-script-runtime.js";

await bindScriptRuntime();
configureGatewayDataDir();

const settings = getEffectiveSettings();
const evalConfig = resolveActiveEvalConfig(getScriptPlatformRuntimeContext().loader, settings);
const evidenceSecret = process.env.EVAL_EVIDENCE_SECRET?.trim();

if (!evidenceSecret) {
  console.error("ERROR: EVAL_EVIDENCE_SECRET 必须配置，才能验证 sim matrix evidence。");
  process.exit(1);
}
if (evalConfig.packIds.length !== 1) {
  console.error(
    `ERROR: 当前只支持单 active Domain Pack evidence 校验，实际 ${evalConfig.packIds.join(",")}`,
  );
  process.exit(1);
}

const reports = evaluateSimMatrixReportEvidence({
  packId: evalConfig.packIds[0]!,
  deploymentId: settings.deployment_id,
  activeDomain: activeDomainId(settings),
  evalPaths: {
    golden: evalConfig.goldenPaths[0]!,
    matrixExtra: evalConfig.matrixExtraPaths[0]!,
    matrixWechat: evalConfig.matrixWechatPaths[0]!,
    matrixNegative: evalConfig.matrixNegativePaths[0]!,
  },
  llmProvider: settings.llm_provider,
  llmBaseUrl: process.env.LLM_BASE_URL ?? settings.llm_base_url,
  model: process.env.LLM_MODEL ?? settings.llm_model,
  llmThinking:
    process.env.LLM_THINKING === undefined
      ? settings.llm_thinking
      : process.env.LLM_THINKING !== "0",
  domainConfig: activeDomainConfig(settings),
  evidenceSecret,
});

for (const report of reports) {
  console.log(`${report.ok ? "OK" : "FAIL"} ${report.slice}: ${report.detail}`);
}

if (reports.some((report) => !report.ok)) {
  process.exit(1);
}
