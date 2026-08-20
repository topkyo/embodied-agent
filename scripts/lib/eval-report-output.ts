import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveAgentDataDir } from "@embodied-agent/platform";

export function evalReportDataRoot(): string {
  return process.env.AGENT_DATA_DIR?.trim() || resolveAgentDataDir();
}

export function writeLocalEvalReport(reportName: string, reportText: string): string {
  const outDir = resolve(evalReportDataRoot(), "local-eval-reports");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, reportName);
  writeFileSync(outPath, reportText, "utf8");

  if (process.env.EVAL_WRITE_DOCS === "1") {
    const docsDir = resolve("docs/eval");
    if (!existsSync(docsDir)) mkdirSync(docsDir, { recursive: true });
    writeFileSync(resolve(docsDir, reportName), reportText, "utf8");
  }

  return outPath;
}

export function writeRuntimeEvalEvidence(opts: {
  deploymentId: string;
  reportName: string;
  reportText: string;
}): string {
  const runtimeReportDir = resolve(
    evalReportDataRoot(),
    "deployments",
    opts.deploymentId,
    "eval-reports",
  );
  if (!existsSync(runtimeReportDir)) mkdirSync(runtimeReportDir, { recursive: true });
  const outPath = resolve(runtimeReportDir, opts.reportName);
  writeFileSync(outPath, opts.reportText, "utf8");
  return outPath;
}
