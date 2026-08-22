import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import {
  getDomainPackCatalog,
  getDomainPackManifest,
  evaluateDomainPackReadinessFromContract,
  preloadAllDomainPacksForReadiness,
  resolveDomainPackContractById,
} from "../apps/api/src/domain-packs/loader.js";
import "../apps/api/src/domain-packs/services.js";
import { bindScriptRuntime, getScriptPlatformRuntimeContext } from "./lib/bind-script-runtime.js";
import { syncActivePackServicesForContract } from "../apps/api/src/domain-packs/services.js";
import { pickPlatformDomainServices } from "@embodied-agent/runtime";
import { assertDomainPackConformance } from "@embodied-agent/domain-sdk";
import type {
  DeviceRegistry,
  DomainPackOpsSchema,
  DomainPackReadinessIssue,
} from "@embodied-agent/core";

type FlywheelAdapterModule = {
  runDomainFlywheel?: unknown;
};

const READINESS_FIXTURE_DIRS: Record<string, string> = {
  agriculture: "scripts/fixtures/ci-eval",
  industrial: "scripts/fixtures/ci-industrial-eval",
  robotics: "scripts/fixtures/ci-robot-eval",
};

const failures: string[] = [];
const require = createRequire(import.meta.url);

function packConformanceTestPath(packId: string): string | null {
  const entry = getDomainPackManifest(getScriptPlatformRuntimeContext().loader).find(
    (item) => item.id === packId,
  );
  if (!entry) return null;
  const packRoot = dirname(require.resolve(`${entry.module}/package.json`));
  return resolve(packRoot, "scene/pack.test.ts");
}

function isOpsSchema(value: unknown): value is DomainPackOpsSchema {
  if (!value || typeof value !== "object") return false;
  const schema = value as Partial<DomainPackOpsSchema>;
  return (
    typeof schema.pack_id === "string" &&
    schema.schema_version === 1 &&
    Array.isArray(schema.navigation?.tabs) &&
    Array.isArray(schema.settings?.fields) &&
    Array.isArray(schema.devices?.binding.required_transports) &&
    Array.isArray(schema.devices?.binding.physical_skills) &&
    Array.isArray(schema.devices?.binding.required_nodes) &&
    Array.isArray(schema.control?.actions) &&
    Array.isArray(schema.eval_evidence?.slices)
  );
}

function validateOpsSchema(packId: string, value: unknown): void {
  if (!isOpsSchema(value)) {
    failures.push(`${packId}: ops capability must expose a valid DomainPackOpsSchema`);
    return;
  }
  if (value.pack_id !== packId) {
    failures.push(`${packId}: ops schema pack_id mismatch`);
  }
  for (const tab of value.navigation.tabs) {
    if (!tab.id.trim() || !tab.label.trim()) {
      failures.push(`${packId}: ops schema navigation tab id/label must be non-empty`);
    }
    if (
      ![
        "overview",
        "control",
        "settings",
        "devices",
        "users",
        "review",
        "platform",
        "extension",
      ].includes(tab.kind)
    ) {
      failures.push(`${packId}: ops schema navigation tab ${tab.id} has invalid kind`);
    }
    if (tab.kind === "extension" && !tab.route.trim()) {
      failures.push(`${packId}: ops schema extension tab ${tab.id} must declare route`);
    }
  }
  const tabIds = new Set(value.navigation.tabs.filter((tab) => tab.enabled).map((tab) => tab.id));
  for (const tabId of ["overview", "settings", "devices", "users", "review", "platform"]) {
    if (!tabIds.has(tabId)) {
      failures.push(`${packId}: ops schema must enable ${tabId} tab`);
    }
  }
  const settingsFields = new Set(value.settings.fields.map((field) => field.id));
  for (const field of value.settings.fields) {
    if (!field.type || !field.control || !field.save_target) {
      failures.push(
        `${packId}: ops schema settings field ${field.id} is missing type/control/save_target`,
      );
    }
  }
  for (const fieldId of ["deployment_id", "active_domain", "llm_api_key"]) {
    if (!settingsFields.has(fieldId)) {
      failures.push(`${packId}: ops schema settings must include ${fieldId}`);
    }
  }
  for (const action of value.control.actions) {
    if (!action.id.trim() || !action.label.trim() || !action.skill.trim()) {
      failures.push(`${packId}: ops schema control action id/label/skill must be non-empty`);
    }
  }
  const evalSlices = new Set(value.eval_evidence.slices.map((slice) => slice.id));
  for (const sliceId of ["golden", "matrix_extra", "matrix_wechat", "matrix_negative"]) {
    if (!evalSlices.has(sliceId as DomainPackOpsSchema["eval_evidence"]["slices"][number]["id"])) {
      failures.push(`${packId}: ops schema eval evidence must include ${sliceId}`);
    }
  }
}

function validateLivePackOpsActionDisplay(packId: string, value: DomainPackOpsSchema): void {
  for (const action of value.control.actions) {
    const display = action.display;
    if (!display?.title_zh?.trim() || !display.icon?.trim()) {
      failures.push(
        `${packId}: ops schema control action ${action.skill} must declare display.title_zh and display.icon`,
      );
    }
  }
}

await bindScriptRuntime();
const scriptCtx = getScriptPlatformRuntimeContext();
await preloadAllDomainPacksForReadiness(scriptCtx.loader);

for (const entry of getDomainPackManifest(scriptCtx.loader)) {
  if ("adminRouteModule" in (entry as Record<string, unknown>)) {
    failures.push(`${entry.id}: runtime manifest must not expose adminRouteModule`);
  }
}

for (const entry of getDomainPackCatalog(scriptCtx.loader)) {
  const conformanceTest = packConformanceTestPath(entry.id);
  if (!conformanceTest || !existsSync(conformanceTest)) {
    failures.push(`${entry.id}: scene/pack.test.ts is required for live and placeholder packs`);
  }
  const contract = resolveDomainPackContractById(scriptCtx.loader, entry.id);
  // 行为级 conformance（含 sceneRuntime 九件套不变量）；placeholder 按 domain-sdk 约定不抛错。
  try {
    assertDomainPackConformance(contract);
  } catch (e) {
    failures.push(`${entry.id}: ${e instanceof Error ? e.message : String(e)}`);
  }
  syncActivePackServicesForContract(scriptCtx, entry.id, contract);
  const readiness = evaluateDomainPackReadinessFromContract(scriptCtx, contract);
  const capabilityKinds = new Set(contract.capabilities.map((capability) => capability.kind));
  if (!capabilityKinds.has("scene")) {
    failures.push(`${entry.id}: contract must expose scene capability`);
  }
  if (!capabilityKinds.has("evidence")) {
    failures.push(`${entry.id}: contract must expose evidence capability`);
  }
  if (!capabilityKinds.has("ops")) {
    failures.push(`${entry.id}: contract must expose ops capability`);
  }
  const opsSchema = contract.capabilities.find((capability) => capability.kind === "ops")?.schema;
  validateOpsSchema(entry.id, opsSchema);

  if (entry.status === "placeholder") {
    if (readiness.deliverable) {
      failures.push(`${entry.id}: placeholder pack must not be deliverable`);
    }
    if (contract.core.readiness?.flywheelGate) {
      failures.push(`${entry.id}: placeholder pack must not declare flywheelGate`);
    }
    continue;
  }

  if (isOpsSchema(opsSchema)) {
    validateLivePackOpsActionDisplay(entry.id, opsSchema);
  }

  if (!readiness.deliverable) {
    failures.push(`${entry.id}: live pack readiness=${readiness.readiness}`);
  }

  if (!contract.core.safety) {
    failures.push(`${entry.id}: live pack contract core must include safety`);
  }
  if (!contract.core.readiness) {
    failures.push(`${entry.id}: live pack contract core must include readiness`);
  }
  const readinessContract = contract.core.readiness as
    | {
        probe?: unknown;
        probeNotRequired?: { reason: string };
      }
    | undefined;
  if (readinessContract) {
    const hasProbe = typeof readinessContract.probe === "function";
    const probeNotRequired = readinessContract.probeNotRequired;
    if (!hasProbe && !probeNotRequired) {
      failures.push(
        `${entry.id}: live pack readiness must declare probe() or probeNotRequired.reason`,
      );
    }
    if (probeNotRequired && typeof probeNotRequired.reason !== "string") {
      failures.push(`${entry.id}: live pack readiness probeNotRequired.reason must be a string`);
    }
    const requiredTransports = (
      contract.core.readiness as { requiredTransports?: readonly string[] } | undefined
    )?.requiredTransports;
    if (!Array.isArray(requiredTransports) || requiredTransports.length === 0) {
      failures.push(
        `${entry.id}: live pack readiness.requiredTransports must be a non-empty array (e.g. ["mqtt"] or ["m20_http"])`,
      );
    }
  }
  // 禁止 live pack 声明空 eval 文件（placeholder 已在上方 continue）
  for (const [sliceKey, evalPath] of Object.entries(contract.core.eval ?? {})) {
    if (typeof evalPath !== "string" || !evalPath.trim()) {
      failures.push(`${entry.id}: eval.${sliceKey} path must be non-empty`);
      continue;
    }
    if (!existsSync(evalPath)) {
      failures.push(`${entry.id}: eval.${sliceKey} file missing: ${evalPath}`);
      continue;
    }
    const body = readFileSync(evalPath, "utf8").trim();
    if (!body) {
      failures.push(`${entry.id}: eval.${sliceKey} must be non-empty JSONL (${evalPath})`);
    }
  }
  if (contract.core.skills.physical.length > 0 && !contract.core.commandAdapter) {
    failures.push(`${entry.id}: physical live pack contract core must include commandAdapter`);
  }
  for (const capability of contract.capabilities) {
    if (!capability.requiredServices?.length) continue;
    try {
      pickPlatformDomainServices(scriptCtx.services, capability.requiredServices);
    } catch (e) {
      failures.push(
        `${entry.id}: ${capability.kind} requiredServices invalid: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  const fixtureDir = READINESS_FIXTURE_DIRS[entry.id];
  if (!fixtureDir) {
    failures.push(`${entry.id}: live pack missing readiness fixture mapping`);
  } else {
    const fixturePath = resolve(fixtureDir);
    const settingsPath = resolve(fixturePath, "settings.json");
    const registryPath = resolve(fixturePath, "device-registry.json");
    if (!existsSync(settingsPath) || !existsSync(registryPath)) {
      failures.push(`${entry.id}: readiness fixture missing at ${fixtureDir}`);
    } else {
      try {
        const fixtureSettings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
          deployment_id: string;
          domain_configs?: Record<string, unknown>;
        };
        const fixtureRegistry = JSON.parse(readFileSync(registryPath, "utf8")) as DeviceRegistry;
        const domainConfig = fixtureSettings.domain_configs?.[entry.id];
        const readinessContract = contract.core.readiness as
          | {
              validateConfig?: (ctx: { domainConfig: unknown }) => DomainPackReadinessIssue[];
              validateRegistry?: (ctx: {
                registry: DeviceRegistry;
                deployment_id: string;
                domainConfig: unknown;
                onlineNodeIds?: readonly string[];
              }) => DomainPackReadinessIssue[];
            }
          | undefined;
        if (readinessContract?.validateConfig) {
          const configIssues = readinessContract.validateConfig({ domainConfig });
          for (const issue of configIssues) {
            failures.push(`${entry.id}: readiness fixture config smoke: ${issue.message}`);
          }
        }
        if (readinessContract?.validateRegistry) {
          const registryIssues = readinessContract.validateRegistry({
            registry: fixtureRegistry,
            deployment_id: fixtureSettings.deployment_id,
            domainConfig,
          });
          for (const issue of registryIssues) {
            failures.push(`${entry.id}: readiness fixture registry smoke: ${issue.message}`);
          }
        }
      } catch (e) {
        failures.push(
          `${entry.id}: readiness fixture smoke failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }
  const gate = contract.core.readiness?.flywheelGate;
  if (!gate?.adapterModule.trim()) {
    failures.push(`${entry.id}: live pack must declare flywheelGate.adapterModule`);
    continue;
  }
  if ("command" in gate) {
    failures.push(`${entry.id}: flywheelGate.command is forbidden; use adapterModule`);
  }
  try {
    const mod = (await import(gate.adapterModule)) as FlywheelAdapterModule;
    if (typeof mod.runDomainFlywheel !== "function") {
      failures.push(`${entry.id}: ${gate.adapterModule} must export runDomainFlywheel()`);
    }
  } catch (e) {
    failures.push(
      `${entry.id}: cannot import ${gate.adapterModule}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

if (failures.length > 0) {
  console.error("[check-domain-pack-contracts] contract violations:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
