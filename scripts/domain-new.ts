import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

type Options = {
  id: string;
  slug: string;
  transport: "mqtt" | "http";
  displayName: string;
  dryRun: boolean;
};

function usage(): never {
  console.error(
    "Usage: npm run domain:new -- --id <id> --slug <slug> --transport mqtt|http [--display-name <name>] [--dry-run]",
  );
  process.exit(1);
}

function readArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function parseOptions(): Options {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) usage();
  const id = readArg(args, "--id")?.trim();
  const slug = readArg(args, "--slug")?.trim();
  const transport = readArg(args, "--transport")?.trim();
  const displayName = readArg(args, "--display-name")?.trim();
  const dryRun = args.includes("--dry-run");

  if (!id || !slug || !transport) usage();
  if (!/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new Error("--id must match /^[a-z][a-z0-9-]*$/");
  }
  if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
    throw new Error("--slug must match /^[a-z][a-z0-9-]*$/");
  }
  if (transport !== "mqtt" && transport !== "http") {
    throw new Error("--transport must be mqtt or http");
  }
  return {
    id,
    slug,
    transport,
    displayName: displayName || `${id} placeholder`,
    dryRun,
  };
}

function pascalCase(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
}

function constantCase(value: string): string {
  return value.replace(/-/g, "_").toUpperCase();
}

function writeText(path: string, content: string, dryRun: boolean): void {
  if (dryRun) {
    console.log(`[dry-run] write ${relative(ROOT, path)}`);
    return;
  }
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, data: unknown, dryRun: boolean): void {
  writeText(path, `${JSON.stringify(data, null, 2)}\n`, dryRun);
}

function scaffoldFiles(options: Options): Map<string, string> {
  const upper = constantCase(options.id);
  const pascal = pascalCase(options.id);
  const packageName = `@embodied-agent/domain-${options.id}`;
  const packConst = `${upper}_PACK`;
  const packIdConst = `${upper}_PACK_ID`;
  const skillPrefix = options.id;
  const requiredTransports =
    options.transport === "mqtt" ? 'requiredTransports: ["mqtt"] as const,' : "";
  const files = new Map<string, string>();

  files.set(
    "package.json",
    `${JSON.stringify(
      {
        name: packageName,
        version: "0.0.1",
        private: true,
        type: "module",
        main: "./dist/index.js",
        types: "./dist/index.d.ts",
        exports: {
          ".": {
            types: "./dist/index.d.ts",
            import: "./dist/index.js",
            default: "./dist/index.js",
          },
          "./package.json": "./package.json",
        },
        scripts: {
          build: "rm -rf dist && tsc -p tsconfig.json",
          "build:bootstrap": "rm -rf dist && tsc -p tsconfig.bootstrap.json",
          test: "vitest run",
        },
        dependencies: {
          "@embodied-agent/core": "0.0.1",
          "@embodied-agent/domain-sdk": "0.0.1",
        },
        devDependencies: {
          typescript: "^5.8.3",
          vitest: "^4.1.8",
        },
      },
      null,
      2,
    )}\n`,
  );

  files.set(
    "tsconfig.json",
    `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
`,
  );
  files.set(
    "tsconfig.bootstrap.json",
    `{
  "extends": "./tsconfig.json",
  "include": ["index.ts", "manifest.ts", "skills.ts", "schemas/**/*.ts", "prompt/**/*.ts", "structural/**/*.ts", "scene/**/*.ts"]
}
`,
  );
  files.set(
    "index.ts",
    `export { ${packConst}, ${packIdConst} } from "./manifest.js";
export { createDomainPackContract, createDomainPackCore } from "./scene/pack.js";
`,
  );
  files.set(
    "manifest.ts",
    `import type { DomainPackManifest } from "@embodied-agent/core";

export const ${packIdConst} = "${options.id}";

export const ${packConst}: DomainPackManifest = {
  id: ${packIdConst},
  displayName: "${options.displayName}",
  status: "placeholder",
  eval: {
    golden: "eval/intent-golden.zh.jsonl",
    matrixExtra: "eval/sim-matrix-extra.jsonl",
    matrixWechat: "eval/sim-matrix-wechat.jsonl",
    matrixNegative: "eval/sim-matrix-negative.jsonl",
  },
};
`,
  );
  files.set(
    "skills.ts",
    `export const ${upper}_P0_SKILLS = [] as const;
export const ${upper}_P1_SKILLS = [] as const;
export const ${upper}_PHYSICAL_SKILLS = [] as const;
`,
  );
  files.set(
    "schemas/intent.ts",
    `import type { z } from "zod";

export const ${options.id.replace(/-/g, "")}IntentSchemas = [] as readonly z.ZodTypeAny[];
`,
  );
  files.set(
    "prompt/scene-skills.ts",
    `export const SCENE_SKILL_PROMPT_SECTION = "";
export const ${upper}_INTENT_CONTRACT = "";
`,
  );
  files.set(
    "structural/structural-intent.ts",
    `import type { IntentPayload } from "@embodied-agent/core";

export function tryStructuralIntentOverride(): IntentPayload | null {
  return null;
}
`,
  );
  files.set(
    "scene/intent-processing.ts",
    `// TODO: 新增 live Domain Pack 时须回填其他 Domain Pack 的 CROSS_DOMAIN_HINT 词表
// （见 scenes/greenhouse/scene/intent-processing.ts、scenes/industrial/scene/intent-processing.ts 等）。
export const ${upper}_INTENT_PROCESSING = "";
`,
  );
  files.set(
    "scene/context.ts",
    `import type { DeviceRegistry } from "@embodied-agent/core";

export function build${pascal}SceneContext(
  _registry: DeviceRegistry,
  _deploymentId: string,
): { scene_context_sections: string[] } {
  return { scene_context_sections: [] };
}
`,
  );
  files.set(
    "scene/registry.ts",
    `import { createPlaceholderSceneRuntime } from "@embodied-agent/domain-sdk";

export const ${upper}_SCENE_RUNTIME = createPlaceholderSceneRuntime("${skillPrefix}");
export const SCENE_SKILL_IDS = ${upper}_SCENE_RUNTIME.sceneSkillIds;
export const isSceneSkillId = ${upper}_SCENE_RUNTIME.isSceneSkillId;
export const resolveSceneForTrigger = ${upper}_SCENE_RUNTIME.resolveSceneForTrigger;
export const resolveSceneFromIntent = ${upper}_SCENE_RUNTIME.resolveSceneFromIntent;
export const evaluateOutcomeSuccess = ${upper}_SCENE_RUNTIME.evaluateOutcomeSuccess;
export const sceneSuccessMetric = ${upper}_SCENE_RUNTIME.sceneSuccessMetric;
export const riskLevelForScene = ${upper}_SCENE_RUNTIME.riskLevelForScene;
export const riskLevelForPhysicalSkill = ${upper}_SCENE_RUNTIME.riskLevelForPhysicalSkill;
export const outcomeThresholdsForScene = ${upper}_SCENE_RUNTIME.outcomeThresholdsForScene;
`,
  );
  files.set(
    "scene/target-resolver.ts",
    `import { createPlaceholderTargetResolver } from "@embodied-agent/domain-sdk";

const resolver = createPlaceholderTargetResolver();

export const is${pascal}PhysicalControlSkill = resolver.isPhysicalControlSkill;
export const resolve${pascal}DeviceTarget = resolver.resolveDeviceTarget;
`,
  );
  files.set(
    "scene/pack.ts",
    `import type {
  DomainPackContract,
  DomainPackCore,
  DomainPackManifest,
} from "@embodied-agent/core";
import {
  createDomainPackOpsSchema,
  defineDomainPackContract,
  defineDomainPackCore,
  packRootFromModuleUrl,
  resolvePackEvalPaths,
} from "@embodied-agent/domain-sdk";
import { ${packConst} } from "../manifest.js";
import {
  ${upper}_P0_SKILLS,
  ${upper}_P1_SKILLS,
  ${upper}_PHYSICAL_SKILLS,
} from "../skills.js";
import { ${options.id.replace(/-/g, "")}IntentSchemas } from "../schemas/intent.js";
import {
  ${upper}_INTENT_CONTRACT,
  SCENE_SKILL_PROMPT_SECTION,
} from "../prompt/scene-skills.js";
import { tryStructuralIntentOverride } from "../structural/structural-intent.js";
import {
  is${pascal}PhysicalControlSkill,
  resolve${pascal}DeviceTarget,
} from "./target-resolver.js";
import {
  SCENE_SKILL_IDS,
  evaluateOutcomeSuccess,
  isSceneSkillId,
  outcomeThresholdsForScene,
  resolveSceneForTrigger,
  resolveSceneFromIntent,
  riskLevelForPhysicalSkill,
  riskLevelForScene,
  sceneSuccessMetric,
} from "./registry.js";
import { build${pascal}SceneContext } from "./context.js";

export function createDomainPackCore(): DomainPackCore {
  const manifest: DomainPackManifest = {
    id: ${packConst}.id,
    displayName: ${packConst}.displayName,
    status: ${packConst}.status,
    eval: resolvePackEvalPaths(
      packRootFromModuleUrl(import.meta.url, "${packageName}"),
      ${packConst}.eval,
    ),
  };

  return defineDomainPackCore({
    manifest,
    skills: {
      p0: ${upper}_P0_SKILLS,
      p1: ${upper}_P1_SKILLS,
      physical: ${upper}_PHYSICAL_SKILLS,
    },
    intentSchemas: ${options.id.replace(/-/g, "")}IntentSchemas,
    prompt: {
      section: SCENE_SKILL_PROMPT_SECTION,
      contract: ${upper}_INTENT_CONTRACT,
    },
    eval: manifest.eval,
    structuralOverrides: {
      tryStructuralIntentOverride,
    },
    targetResolver: {
      isPhysicalControlSkill: is${pascal}PhysicalControlSkill,
      resolveDeviceTarget: resolve${pascal}DeviceTarget,
    },
    readiness: {
      ${requiredTransports}
    },
    sceneRuntime: {
      sceneSkillIds: SCENE_SKILL_IDS,
      isSceneSkillId,
      resolveSceneForTrigger,
      resolveSceneFromIntent,
      evaluateOutcomeSuccess,
      sceneSuccessMetric,
      riskLevelForScene,
      riskLevelForPhysicalSkill,
      outcomeThresholdsForScene,
    },
    context: {
      buildDeploymentContext: build${pascal}SceneContext,
    },
  });
}

export function createDomainPackContract(): DomainPackContract {
  const core = createDomainPackCore();
  return defineDomainPackContract({
    core,
    capabilities: [
      { kind: "scene", runtime: core.sceneRuntime },
      { kind: "ops", schema: createDomainPackOpsSchema(core) },
      { kind: "evidence", eval: core.eval, readiness: core.readiness },
    ],
  });
}
`,
  );
  files.set(
    "scene/pack.test.ts",
    `import { describe, expect, it } from "vitest";
import { assertDomainPackConformance } from "@embodied-agent/domain-sdk";
import { createDomainPackContract } from "./pack.js";

describe("${options.id} placeholder Domain Pack", () => {
  it("is scaffolded as a non-deliverable placeholder with explicit contract gaps", () => {
    const result = assertDomainPackConformance(createDomainPackContract());
    expect(result.status).toBe("placeholder");
    expect(result.deliverable).toBe(false);
    expect(result.capability_kinds).toEqual(expect.arrayContaining(["scene", "ops", "evidence"]));
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "placeholder_pack",
        "skills_empty",
        "intent_schemas_empty",
        "intent_contract_empty",
        "safety_missing",
      ]),
    );
  });
});
`,
  );
  for (const evalFile of [
    "eval/intent-golden.zh.jsonl",
    "eval/sim-matrix-extra.jsonl",
    "eval/sim-matrix-wechat.jsonl",
    "eval/sim-matrix-negative.jsonl",
  ]) {
    files.set(evalFile, "");
  }
  return files;
}

function updateCatalog(options: Options, dryRun: boolean): void {
  const path = join(ROOT, "domain-packs.json");
  const data = readJson<{
    packs: Array<{
      id: string;
      module: string;
      displayName: string;
      webSlug: string;
      status: "live" | "placeholder";
    }>;
  }>(path);
  if (data.packs.some((pack) => pack.id === options.id || pack.webSlug === options.slug)) {
    throw new Error(
      `Domain Pack ${options.id}/${options.slug} already exists in domain-packs.json`,
    );
  }
  data.packs.push({
    id: options.id,
    module: `@embodied-agent/domain-${options.id}`,
    displayName: options.displayName,
    webSlug: options.slug,
    status: "placeholder",
  });
  writeJson(path, data, dryRun);
}

function updateRootTsconfig(options: Options, dryRun: boolean): void {
  const path = join(ROOT, "tsconfig.json");
  const data = readJson<{ files: unknown[]; references: Array<{ path: string }> }>(path);
  const ref = `scenes/${options.slug}`;
  if (!data.references.some((item) => item.path === ref)) {
    const safetyIndex = data.references.findIndex((item) => item.path === "packages/safety");
    const insertAt = safetyIndex === -1 ? data.references.length : safetyIndex;
    data.references.splice(insertAt, 0, { path: ref });
  }
  writeJson(path, data, dryRun);
}

function updateBuildScript(options: Options, dryRun: boolean): void {
  const path = join(ROOT, "scripts/ensure-workspace-runtime-build.sh");
  const packageName = `@embodied-agent/domain-${options.id}`;
  const anchor = "# domain-packs:insert-here";
  const insertLine = `run_domain_pack "${packageName}" "scenes/${options.slug}/src" "scenes/${options.slug}/dist"`;
  let text = readFileSync(path, "utf8");
  if (!text.includes(anchor)) {
    throw new Error(`ensure-workspace-runtime-build.sh missing anchor ${anchor}`);
  }
  if (text.includes(`"${packageName}"`)) {
    return;
  }
  text = text.replace(anchor, `${insertLine}\n${anchor}`);
  writeText(path, text, dryRun);
}

function main(): void {
  const options = parseOptions();
  const sceneDir = join(ROOT, "scenes", options.slug);
  if (existsSync(sceneDir)) {
    throw new Error(`${relative(ROOT, sceneDir)} already exists`);
  }

  const files = scaffoldFiles(options);
  for (const [relativePath, content] of files) {
    writeText(join(sceneDir, relativePath), content, options.dryRun);
  }
  updateCatalog(options, options.dryRun);
  updateRootTsconfig(options, options.dryRun);
  updateBuildScript(options, options.dryRun);
  console.log(
    `${options.dryRun ? "Would create" : "Created"} placeholder Domain Pack ${options.id} at ${relative(ROOT, sceneDir)}`,
  );
  if (!options.dryRun) {
    console.log("Run npm install --package-lock-only before committing workspace metadata.");
  }
}

main();
