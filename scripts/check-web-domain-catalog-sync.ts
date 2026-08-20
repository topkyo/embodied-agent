#!/usr/bin/env npx tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type RuntimePack = {
  id: string;
  webSlug: string;
  status: "live" | "placeholder";
};

const ROOT = resolve(import.meta.dirname, "..");
const catalogPath = resolve(ROOT, "domain-packs.json");
const outputPaths = [
  resolve(ROOT, "apps/web/src/lib/domain-packs.runtime.generated.ts"),
  resolve(ROOT, "apps/site/src/lib/domain-packs.runtime.generated.ts"),
];

const DISPLAY_NAME_KEYS: Record<string, string> = {
  agriculture: "nav.farm",
  robotics: "scenes.robot.title",
  industrial: "scenes.industrial.title",
  aquaculture: "scenes.aquaculture.title",
};

const WEB_STATUS: Record<RuntimePack["status"], "live" | "next"> = {
  live: "live",
  placeholder: "next",
};

const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as { packs?: RuntimePack[] };
const packs = catalog.packs ?? [];

const lines = packs.map((pack) => {
  const displayNameKey = DISPLAY_NAME_KEYS[pack.id];
  if (!displayNameKey)
    throw new Error(`Missing displayNameKey mapping for runtime pack ${pack.id}`);
  const status = WEB_STATUS[pack.status];
  const opsEnabled = pack.status === "live";
  const base = [
    `  {`,
    `    packId: "${pack.id}",`,
    `    slug: "${pack.webSlug}",`,
    `    displayNameKey: "${displayNameKey}",`,
    `    status: "${status}",`,
    `    runtimeStatus: "${pack.status}",`,
    `    scenePath: "/scenes/${pack.webSlug}",`,
  ];
  if (opsEnabled) {
    base.push(`    opsPath: "/scenes/${pack.webSlug}/ops",`);
    base.push(`    opsEnabled: true,`);
  } else {
    base.push(`    opsEnabled: false,`);
  }
  base.push(`  },`);
  return base.join("\n");
});

const expected = `/** AUTO-GENERATED from domain-packs.json — run: npm run codegen:web-catalog */
import type { DomainPackMeta } from "./domain-packs.js";

export const RUNTIME_DOMAIN_PACK_CATALOG = [
${lines.join("\n")}
] as const satisfies readonly DomainPackMeta[];
`;

let failed = false;
for (const outputPath of outputPaths) {
  const actual = readFileSync(outputPath, "utf8");
  if (actual !== expected) {
    console.error(`domain catalog out of sync: ${outputPath}`);
    console.error("run: npm run codegen:web-catalog");
    failed = true;
  }
}
if (failed) process.exit(1);
