import { mkdir } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CommandMessage } from "@embodied-agent/core";
import { LlmUnavailableError } from "@embodied-agent/agent";
import { MqttCommandPublisher } from "@embodied-agent/node";
import { appendSignedFlywheelAttestation } from "./flywheel-attestation.js";
import { writeLocalEvalReport } from "./eval-report-output.js";

export const FLYWHEEL_ADMIN_TOKEN = "dev-admin";

export type ScenarioResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

export type FlywheelArgs = { allowSkip: boolean };

export type FlywheelSeed = {
  settings: unknown;
  deviceRegistry: unknown;
  users: unknown;
  platformBindings: unknown;
};

export type StartInProcessAppOptions = {
  pipeline: {
    llmClient: unknown;
    model: string;
    mqttEnabled: boolean;
    mqtt?: unknown;
  };
  beforeListen?: () => void | Promise<void>;
};

export function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

export function parseFlywheelArgs(argv: string[]): FlywheelArgs {
  let allowSkip = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--allow-skip") allowSkip = true;
    else throw new Error(`未知参数: ${arg}`);
  }
  return { allowSkip };
}

export function createScenarioRunner(): {
  run: (name: string, fn: () => Promise<void>) => Promise<void>;
  results: ScenarioResult[];
} {
  const results: ScenarioResult[] = [];

  async function run(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`PASS ${name}`);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      results.push({ name, ok: false, detail });
      console.error(`FAIL ${name}: ${detail}`);
    }
  }

  return { run, results };
}

export async function postJson(
  baseUrl: string,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

export async function handleLlmUnavailable(
  err: unknown,
  opts: { allowSkip: boolean; pack: string; cleanup: () => void | Promise<void> },
): Promise<void> {
  if (!(err instanceof LlmUnavailableError)) {
    throw err;
  }
  if (opts.allowSkip) {
    console.log("SKIP: LLM 未配置");
    console.log(JSON.stringify({ skipped_reason: "llm_unavailable" }));
    await opts.cleanup();
    return;
  }
  console.error(`LLM 未配置，${opts.pack} flywheel 失败。使用 --allow-skip 显式跳过。`);
  await opts.cleanup();
  process.exit(1);
}

export async function startInProcessApp(
  _dataDir: string,
  options: StartInProcessAppOptions,
): Promise<{
  app: Awaited<ReturnType<(typeof import("../../apps/api/src/app.js"))["buildApp"]>>;
  baseUrl: string;
}> {
  const { initRuntime, resetRuntimeInitForTests } =
    await import("../../apps/api/src/runtime/init.js");
  const { buildApp } = await import("../../apps/api/src/app.js");
  const { clearEffectiveSettingsCacheForTest } =
    await import("../../apps/api/src/settings/store.js");

  // flywheel 入口（domain-flywheel.ts → bindScriptRuntime）在 import 阶段
  // 已缓存 ci-* fixture 的 settings（含错误的 m20_base_url / deployment_id）。
  // seedFlywheelData 写入临时目录后必须清除缓存 + 重置 runtime 单例，
  // 使 initRuntime 从临时目录读取正确的 settings。
  clearEffectiveSettingsCacheForTest();
  resetRuntimeInitForTests();

  await initRuntime();
  if (options.beforeListen) {
    await options.beforeListen();
  }

  // mqttEnabled=false 且未显式注入 mqtt 时，用 RecordingMqttPublisher 避免
  // buildApp 创建真实 MQTT 连接（无 broker 时 ECONNREFUSED）。
  const mqttPublisher =
    options.pipeline.mqtt ??
    (options.pipeline.mqttEnabled === false ? new RecordingMqttPublisher() : undefined);

  const mqttCtx = mqttPublisher
    ? {
        publisher: {
          get: (_url: string) => mqttPublisher,
          status: () => null,
          reset: () => {},
        },
      }
    : undefined;

  const app = await buildApp({
    pipeline: options.pipeline,
    mqttCtx,
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  assert(address && typeof address !== "string", "api listen failed");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return { app, baseUrl };
}

export async function seedFlywheelData(dataDir: string, seed: FlywheelSeed): Promise<void> {
  await writeFile(join(dataDir, "settings.json"), JSON.stringify(seed.settings, null, 2));
  await writeFile(
    join(dataDir, "device-registry.json"),
    JSON.stringify(seed.deviceRegistry, null, 2),
  );
  await writeFile(join(dataDir, "users.json"), JSON.stringify(seed.users, null, 2));
  await writeFile(
    join(dataDir, "platform-bindings.json"),
    JSON.stringify(seed.platformBindings, null, 2),
  );
}

export function buildFlywheelReport(results: ScenarioResult[]): {
  passed: number;
  failed: number;
  results: ScenarioResult[];
  exitCode: number;
} {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  return {
    passed,
    failed,
    results,
    exitCode: passed === results.length ? 0 : 1,
  };
}

export class RecordingMqttPublisher extends MqttCommandPublisher {
  published: CommandMessage[] = [];

  constructor(mqttUrl = "mqtt://127.0.0.1:1883") {
    super(mqttUrl);
  }

  override async connect(): Promise<void> {}

  override async publishCommand(cmd: CommandMessage): Promise<void> {
    this.published.push(cmd);
  }

  override async publishNodeConfig(): Promise<void> {}
}

export function attestFlywheelScenario(path: string, row: Record<string, unknown>): void {
  appendSignedFlywheelAttestation(path, row);
}

export async function prepareFlywheelAttestationPath(
  dataDir: string,
  deploymentId: string,
): Promise<string> {
  const attestationPath = join(
    dataDir,
    "deployments",
    deploymentId,
    "flywheel-scene-attestations.jsonl",
  );
  await mkdir(join(dataDir, "deployments", deploymentId), { recursive: true });
  return attestationPath;
}

export async function getAdminJson(
  baseUrl: string,
  path: string,
  adminToken = FLYWHEEL_ADMIN_TOKEN,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "x-admin-token": adminToken },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

export function writePackFlywheelReport(opts: {
  pack: string;
  deployment_id: string;
  model: string;
  llm_real?: boolean;
  attestation_path: string;
  results: ScenarioResult[];
  reportFileName: string;
}): { reportPath: string; passed: number; total: number; exitCode: number } {
  const { passed, exitCode } = buildFlywheelReport(opts.results);
  const report = {
    at: new Date().toISOString(),
    pack: opts.pack,
    deployment_id: opts.deployment_id,
    model: opts.model,
    llm_real: opts.llm_real ?? true,
    attestation_path: opts.attestation_path,
    total: opts.results.length,
    passed,
    failed: opts.results.length - passed,
    results: opts.results,
  };
  const reportPath = writeLocalEvalReport(
    opts.reportFileName,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return { reportPath, passed, total: opts.results.length, exitCode };
}
