import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

type Rule = {
  name: string;
  pattern: RegExp;
  allowPattern?: RegExp;
  allowFiles?: RegExp;
  hint: string;
};

const GLOBAL_RULES: Rule[] = [
  {
    name: "old-core-skills-truth-source",
    pattern:
      /packages\/core\/src\/skills\.ts[\s\S]{0,220}(?:权威枚举|唯一权威|权威来源|P0_SKILLS|P1_SKILLS|P2_SKILLS)/,
    allowPattern: /packages\/core\/src\/skills\.ts[\s\S]{0,220}为空数组/,
    hint: "Use Domain Pack skills.ts as the skill enumeration truth source; packages/core/src/skills.ts is an empty contract placeholder.",
  },
  {
    name: "old-active-domain-greenhouse",
    pattern: /\bACTIVE_DOMAIN\s*=\s*greenhouse\b|["`]active_domain["`]\s*:\s*["`]greenhouse["`]/,
    hint: 'Use active_domain/ACTIVE_DOMAIN "agriculture".',
  },
  {
    name: "old-active-domain-robot",
    pattern: /\bACTIVE_DOMAIN\s*=\s*robot\b|["`]active_domain["`]\s*:\s*["`]robot["`]/,
    hint: 'Use active_domain/ACTIVE_DOMAIN "robotics".',
  },
  {
    name: "old-domain-config-robot",
    pattern: /["`]domain_configs["`][\s\S]{0,300}["`]robot["`]\s*:/,
    hint: "Use domain_configs.robotics.",
  },
  {
    name: "old-web-token-path",
    pattern: /apps\/web\/src\/styles\/tokens\.css/,
    hint: "Use apps/web/src/design/tokens.css.",
  },
  {
    name: "old-console-settings-route",
    pattern: /\/console\/settings/,
    hint: "Use /scenes/{active-pack}/ops/platform for platform settings.",
  },
  {
    name: "old-console-pair-route",
    pattern: /\/console\/devices\/pair/,
    hint: "Use /scenes/{active-pack}/ops/devices/pair for node pairing.",
  },
  {
    name: "old-console-wildcard-route",
    pattern: /\/console(?:\/|\*|$)/,
    allowPattern: /已删除|不得回流|is removed|features\/console/i,
    hint: "Use /scenes/{active-pack}/ops/* routes; /console is removed.",
  },
  {
    name: "old-web-settings-route",
    pattern: /(?:^|[^\w{])\/settings(?:\/pair)?(?:[^\w{]|$)/,
    allowPattern:
      /\/ops\/settings|\/admin\/settings|settings\.json|settings\/store|已删除|不得回流|is removed/i,
    hint: "Use /scenes/{active-pack}/ops/settings; bare /settings is removed.",
  },
  {
    name: "old-web-landing-route",
    pattern: /(?:^|[^\w{])\/landing(?:[^\w{]|$)/,
    allowPattern: /已删除|不得回流|is removed/i,
    hint: "Use / or /scenes; /landing is removed.",
  },
  {
    name: "old-web-farm-alias-route",
    pattern: /\/scenes\/farm(?:[^\w{]|$)/,
    allowPattern: /已删除|不得回流|is removed/i,
    hint: "Use /scenes/greenhouse; /scenes/farm is removed.",
  },
  {
    name: "bare-data-settings-path",
    pattern: /(^|[^}/])data\/settings\.json/,
    hint: "Use {AGENT_DATA_DIR}/settings.json for runtime settings paths.",
  },
  {
    name: "bare-data-runtime-path",
    pattern: /(^|[^}{./-])data\/(?!to-impact|settings\.json|digest-state\.json)/,
    hint: "Use {AGENT_DATA_DIR}/... or {AGENT_DATA_DIR}/deployments/{deployment_id}/... for runtime data paths.",
  },
  {
    name: "bare-data-digest-path",
    pattern: /(^|[^}/])data\/digest-state\.json/,
    hint: "Use {AGENT_DATA_DIR}/deployments/{deployment_id}/digest-state.json for runtime digest state.",
  },
  {
    name: "old-apps-api-data-path",
    pattern: /apps\/api\/data/,
    hint: "Do not reference the removed source-package runtime data directory in active docs.",
  },
  {
    name: "old-farm-user-field",
    pattern: /\bfarm_user_id\b/,
    hint: "Use principal_user_id.",
  },
  {
    name: "old-farm-id-field",
    pattern: /\bfarm_id\b/,
    hint: "Use deployment_id.",
  },
  {
    name: "old-active-domains-field",
    pattern: /\bactive_domains\b/,
    hint: "Use single active_domain.",
  },
  {
    name: "old-scene-flywheel-command",
    pattern: /\bscene:flywheel\b/,
    hint: "Use npm run domain:flywheel.",
  },
  {
    name: "old-scene-l3-smoke-command",
    pattern: /\bscene:l3-smoke\b/,
    hint: "Use npm run domain:l3-smoke.",
  },
  {
    name: "old-robot-flywheel-command",
    pattern: /\brobot:flywheel\b/,
    hint: "Use AGENT_DATA_DIR=scripts/fixtures/ci-robot-eval npm run domain:flywheel.",
  },
  {
    name: "old-scene-flywheel-data-root",
    pattern: /\.agentstack\/dev-runs\/scene-flywheel\/data/,
    hint: "Use the active Domain Pack data root selected by npm run domain:flywheel.",
  },
  {
    name: "old-greenhouse-domain-pack-term",
    pattern: /greenhouse Domain Pack/,
    hint: "Use agriculture Domain Pack; greenhouse is the current agriculture scene.",
  },
  {
    name: "docs-eval-as-report-truth",
    pattern: /docs\/eval\/\{packId\}|docs\/eval\/\*-report\.json/,
    hint: "Use {AGENT_DATA_DIR}/deployments/{deployment_id}/eval-reports for delivery evidence; docs/eval is opt-in diagnostics only.",
  },
  {
    name: "old-scene-pack-terms",
    pattern:
      /\bScenePack\b|scene-packs|active_scene_pack|scene_pack_configs|@embodied-agent\/scene-/,
    hint: "Use domain-packs/active_domain/domain_configs/@embodied-agent/domain-* and createDomainPackContract().",
  },
  {
    name: "old-scene-outcome-delta-fields",
    pattern: /\bdelta_temperature_c\b|\bdelta_humidity_percent\b/,
    hint: "SceneOutcome uses metrics.temperature_delta_c / metrics.humidity_delta_percent.",
  },
];

const NODE_DOC_RULES: Rule[] = [
  {
    name: "node-doc-greenhouse-id-json",
    pattern: /["`]greenhouse_id["`]\s*:/,
    hint: "Node install, pairing, binding, and config examples must use entity_id.",
  },
  {
    name: "node-doc-greenhouse-binding",
    pattern: /deployment_id\s*\/\s*greenhouse_id|deployment_id`\s*\+\s*`greenhouse_id/,
    hint: "Node binding docs must describe deployment_id + entity_id.",
  },
];

const DEVICE_REGISTRY_DOC_RULES: Rule[] = [
  {
    name: "device-registry-greenhouse-json",
    pattern: /["`]greenhouse_id["`]\s*:/,
    hint: "Registry entity, device, node, and resolved examples must use entity_id; only prose may mention agriculture intent target.greenhouse_id.",
  },
  {
    name: "device-registry-greenhouse-section",
    pattern: /^### greenhouse\b/m,
    hint: "Registry docs must describe entities[]; greenhouse is an agriculture entity_type.",
  },
  {
    name: "device-registry-old-device-fields",
    pattern:
      /\brequires_duration\b|\bdefault_duration_seconds\b|\bmanual_override_supported\b|\blimit_switch_supported\b/,
    hint: "Registry device docs must match current packages/core schemas and RegistryDevice extension fields.",
  },
];

const ENGINEERING_ENTRYPOINT_RULES: Rule[] = [
  {
    name: "old-scene-l3-smoke-command",
    pattern: /\bscene:l3-smoke\b/,
    hint: "Use npm run domain:l3-smoke.",
  },
  {
    name: "old-scene-flywheel-command",
    pattern: /\bscene:flywheel\b/,
    hint: "Use npm run domain:flywheel.",
  },
  {
    name: "old-robot-flywheel-command",
    pattern: /\brobot:flywheel\b/,
    hint: "Use AGENT_DATA_DIR=scripts/fixtures/ci-robot-eval npm run domain:flywheel.",
  },
];

function listDocs(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "archive") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listDocs(full));
    } else if (/\.(md|zh\.md)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function listSceneDocs(): string[] {
  const sceneDocs: string[] = [];
  const scenesDir = join(ROOT, "scenes");
  if (!existsSync(scenesDir)) return sceneDocs;
  for (const entry of readdirSync(scenesDir)) {
    const docsDir = join(scenesDir, entry, "docs");
    if (existsSync(docsDir) && statSync(docsDir).isDirectory()) {
      sceneDocs.push(...listDocs(docsDir));
    }
  }
  return sceneDocs;
}

const files = [
  join(ROOT, "README.md"),
  join(ROOT, "README.en.md"),
  join(ROOT, "AGENTS.md"),
  join(ROOT, "DESIGN.md"),
  ...listDocs(join(ROOT, "docs")),
  ...listSceneDocs(),
];

const failures: string[] = [];

function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  for (const rule of GLOBAL_RULES) {
    if (rule.pattern.test(text) && !rule.allowPattern?.test(text) && !rule.allowFiles?.test(rel)) {
      failures.push(`${rel}: ${rule.name}. ${rule.hint}`);
    }
  }
}

const archiveScriptsDir = join(ROOT, "docs/archive/scripts");
if (existsSync(archiveScriptsDir)) {
  for (const file of listFiles(archiveScriptsDir)) {
    const text = readFileSync(file, "utf8");
    if (text.startsWith("#!")) {
      failures.push(
        `${relative(ROOT, file)}: archive-script-shebang. Archived scripts must not look executable; keep them as text-only references.`,
      );
    }
  }
}

for (const file of [
  join(ROOT, "package.json"),
  join(ROOT, ".github/workflows/ci.yml"),
  join(ROOT, "scripts/domain-flywheel-agriculture-setup.sh"),
  join(ROOT, "scripts/verify-intent-gate.sh"),
  join(ROOT, "scripts/verify-strict-gate.sh"),
]) {
  const text = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  for (const rule of ENGINEERING_ENTRYPOINT_RULES) {
    if (rule.pattern.test(text)) {
      failures.push(`${rel}: ${rule.name}. ${rule.hint}`);
    }
  }
}

const nodeDoc = join(ROOT, "docs/protocol/esp32-node-registration.zh.md");
const nodeDocText = readFileSync(nodeDoc, "utf8");
for (const rule of NODE_DOC_RULES) {
  if (rule.pattern.test(nodeDocText)) {
    failures.push(`${relative(ROOT, nodeDoc)}: ${rule.name}. ${rule.hint}`);
  }
}

const deviceRegistryDoc = join(ROOT, "docs/protocol/device-registry.zh.md");
const deviceRegistryText = readFileSync(deviceRegistryDoc, "utf8");
for (const rule of DEVICE_REGISTRY_DOC_RULES) {
  if (rule.pattern.test(deviceRegistryText)) {
    failures.push(`${relative(ROOT, deviceRegistryDoc)}: ${rule.name}. ${rule.hint}`);
  }
}

const commandProtocolDoc = join(ROOT, "docs/protocol/command-protocol.zh.md");
const commandProtocolText = readFileSync(commandProtocolDoc, "utf8");
for (const messageType of ["command_event", "telemetry", "heartbeat"]) {
  const blockPattern = new RegExp(`"message_type"\\s*:\\s*"${messageType}"[\\s\\S]*?\\n\\}`, "g");
  const blocks = commandProtocolText.match(blockPattern) ?? [];
  if (blocks.length === 0) {
    failures.push(
      `${relative(ROOT, commandProtocolDoc)}: missing-${messageType}-example. Expected protocol example.`,
    );
  }
  for (const block of blocks) {
    if (!/"node_token"\s*:/.test(block)) {
      failures.push(
        `${relative(ROOT, commandProtocolDoc)}: ${messageType}-missing-node-token. MQTT ${messageType} examples must include node_token.`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("[check-domain-docs] domain documentation drift detected:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}
