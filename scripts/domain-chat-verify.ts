import { createIntentResolver, LlmUnavailableError } from "@embodied-agent/agent";
import type { DeploymentContext, IntentResolver, LlmChatTurn } from "@embodied-agent/agent";
import type { createLlmClientFromSettings } from "./lib/intent-eval-common.js";

type VerifySlice = "core" | "wechat" | "negative";

type Args = {
  packId: string;
  slice: VerifySlice;
  limit?: number;
  dryRun: boolean;
  allowSkip: boolean;
};

type Row = {
  id: number;
  utterance: string;
  expected_skill: string;
  expected?: { target?: Record<string, unknown>; parameters?: Record<string, unknown> };
  history?: readonly LlmChatTurn[];
  normalize?: boolean;
  note?: string;
};

type LlmDeps = ReturnType<typeof createLlmClientFromSettings>;

function usage(): never {
  console.error(
    "用法: npm run domain:chat-verify -- --pack <id> [--slice core|wechat|negative] [--limit N] [--dry-run] [--allow-skip]",
  );
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  let packId = "";
  let slice: VerifySlice = "wechat";
  let limit: number | undefined;
  let dryRun = false;
  let allowSkip = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--pack") {
      packId = argv[++i]?.trim() ?? "";
    } else if (arg === "--slice") {
      const raw = argv[++i]?.trim();
      if (raw !== "core" && raw !== "wechat" && raw !== "negative") usage();
      slice = raw;
    } else if (arg === "--limit") {
      const raw = Number(argv[++i]);
      if (!Number.isInteger(raw) || raw <= 0) usage();
      limit = raw;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--allow-skip") {
      allowSkip = true;
    } else {
      usage();
    }
  }
  if (!packId) usage();
  return { packId, slice, limit, dryRun, allowSkip };
}

function renumber(rows: Omit<Row, "id">[], limit?: number): Row[] {
  return rows.slice(0, limit).map((row, index) => ({ ...row, id: index + 1 }));
}

async function loadRows(packId: string, slice: VerifySlice, limit?: number): Promise<Row[]> {
  const { resolveDomainPackContractById } = await import("../apps/api/src/domain-packs/loader.js");
  const { getScriptPlatformRuntimeContext } = await import("./lib/bind-script-runtime.js");
  const { loadGoldenRows } = await import("./lib/intent-eval-common.js");
  const evalPaths = resolveDomainPackContractById(getScriptPlatformRuntimeContext().loader, packId)
    .core.eval;
  if (slice === "core") {
    return renumber(
      [...loadGoldenRows(evalPaths.golden), ...loadGoldenRows(evalPaths.matrixExtra)],
      limit,
    );
  }
  if (slice === "wechat") {
    return renumber(loadGoldenRows(evalPaths.matrixWechat), limit);
  }
  return renumber(loadGoldenRows(evalPaths.matrixNegative), limit);
}

async function verifyRow(
  row: Row,
  deploymentContext: DeploymentContext,
  deps: LlmDeps,
  resolver: IntentResolver,
): Promise<{ ok: boolean; actual: string; detail?: string }> {
  const { matchesExpectation } = await import("./lib/intent-eval-common.js");
  const text = row.normalize === true ? resolver.normalizeUtterance(row.utterance) : row.utterance;
  const { result } = await resolver.resolveWithEscalation(
    text,
    deploymentContext,
    { llmClient: deps.client, model: deps.model },
    { history: row.history },
  );
  if (!result.ok) {
    return { ok: false, actual: "llm_unavailable", detail: "LLM 不可用" };
  }
  if (result.validation.kind === "clarification") {
    const actual = "clarification_needed";
    return {
      ok: row.expected_skill === actual,
      actual,
      detail: result.validation.message.slice(0, 120),
    };
  }
  const parsed = {
    skill: result.validation.intent.skill,
    target: result.validation.intent.target,
    parameters:
      "parameters" in result.validation.intent ? result.validation.intent.parameters : undefined,
  };
  return {
    ok: matchesExpectation(row, parsed),
    actual: result.validation.intent.skill,
    detail: JSON.stringify(parsed),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  process.env.ACTIVE_DOMAIN = args.packId;

  const { bindScriptRuntime, getScriptAgentRuntimeContext, getScriptPlatformRuntimeContext } =
    await import("./lib/bind-script-runtime.js");
  await bindScriptRuntime();
  const resolver = createIntentResolver(getScriptAgentRuntimeContext());
  const { preloadDomainPacks, resolveDomainPackContractById } =
    await import("../apps/api/src/domain-packs/loader.js");
  const { getEffectiveSettings } = await import("../apps/api/src/settings/store.js");
  const scriptCtx = getScriptPlatformRuntimeContext();
  const {
    configureGatewayDataDir,
    createLlmClientFromSettings,
    loadDeploymentContextFromRegistry,
  } = await import("./lib/intent-eval-common.js");
  const { writeLocalEvalReport } = await import("./lib/eval-report-output.js");

  configureGatewayDataDir();
  await preloadDomainPacks(scriptCtx.loader, { packIds: [args.packId] });
  const contract = resolveDomainPackContractById(scriptCtx.loader, args.packId);
  const settings = getEffectiveSettings();
  if (settings.active_domain !== args.packId) {
    throw new Error(
      `domain:chat-verify 只验证当前 active_domain；期望 ${args.packId}，实际 ${settings.active_domain ?? "(missing)"}`,
    );
  }
  if (contract.core.manifest.status !== "live") {
    throw new Error(
      `domain:chat-verify 只验证 live pack，${args.packId} 当前为 ${contract.core.manifest.status}`,
    );
  }

  const rows = await loadRows(args.packId, args.slice, args.limit);
  if (rows.length === 0) {
    throw new Error(`${args.packId} ${args.slice} matrix 为空`);
  }
  if (args.dryRun) {
    console.log(`DRY ${args.packId} ${args.slice}: ${rows.length} rows`);
    return;
  }

  let deps: ReturnType<typeof createLlmClientFromSettings>;
  try {
    deps = createLlmClientFromSettings();
  } catch (e) {
    if (e instanceof LlmUnavailableError) {
      if (args.allowSkip) {
        console.log("SKIP: LLM 未配置，domain:chat-verify 未运行。");
        return;
      }
      console.error("LLM 未配置，domain:chat-verify 失败。使用 --allow-skip 显式跳过。");
      process.exit(1);
    }
    throw e;
  }

  const deploymentContext = loadDeploymentContextFromRegistry();
  const results = [];
  for (const row of rows) {
    const verified = await verifyRow(row, deploymentContext, deps, resolver);
    results.push({ ...row, ...verified });
    console.log(
      `${verified.ok ? "PASS" : "FAIL"} #${row.id} ${row.utterance} -> ${verified.actual}`,
    );
  }

  const passed = results.filter((result) => result.ok).length;
  const report = {
    generated_at: new Date().toISOString(),
    pack: args.packId,
    active_domain: settings.active_domain,
    deployment_id: settings.deployment_id,
    slice: args.slice,
    model: deps.model,
    passed,
    total: results.length,
    pass_rate: passed / results.length,
    results,
  };
  const reportPath = writeLocalEvalReport(
    `${args.packId}-${args.slice}-chat-verify-report.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(`Report: ${reportPath}`);
  console.log(`Summary: ${passed}/${results.length}`);
  if (passed < results.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
