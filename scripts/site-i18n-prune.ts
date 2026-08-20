/**
 * Scan apps/site i18n used keys vs zh/en dictionaries; optionally prune dead keys.
 * Run: npx tsx scripts/site-i18n-prune.ts [--write]
 *
 * Dynamics are expanded with known slugs (not open-ended regex) to avoid
 * false-positive "used" for console.*.title / sceneOps.*.title etc.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { en } from "../apps/site/src/i18n/en.ts";
import { zh } from "../apps/site/src/i18n/zh.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_SRC = path.join(ROOT, "apps/site/src");
const WRITE = process.argv.includes("--write");

/** ConceptScenePage prefix = scene.${slug} */
const CONCEPT_SLUGS = ["aquaculture", "coldchain", "elderly", "pet"] as const;
/** DemoPanel sceneSlug */
const DEMO_SLUGS = ["greenhouse", "robot", "industrial"] as const;
/** ScenesList EXPLORE_SCENE_SLUGS + other scenes.${slug}.title */
const SCENES_TITLE_SLUGS = [
  "greenhouse",
  "robot",
  "industrial",
  "aquaculture",
  "coldchain",
  "elderly",
  "pet",
  "farm",
] as const;

function walk(dir: string, files: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx)$/.test(ent.name)) files.push(p);
  }
  return files;
}

function expandKnownDynamics(used: Set<string>, allKeys: Set<string>): void {
  // ConceptScenePage templates
  const conceptSuffixes = [
    "badge",
    "boundary",
    "cta",
    "hw",
    "id",
    "headline",
    "lead",
    "trio.eyebrow",
    "trio",
    "trioSub",
    "section",
    "sectionH",
    "sectionSub",
    "boundaryTitle",
    "boundaryH",
    "boundarySub",
    "footer",
  ];
  for (const slug of CONCEPT_SLUGS) {
    for (const s of conceptSuffixes) {
      const k = `scene.${slug}.${s}`;
      if (allKeys.has(k)) used.add(k);
    }
    for (const n of [1, 2, 3]) {
      for (const s of [`trio.n${n}`, `t${n}`, `t${n}d`]) {
        const k = `scene.${slug}.${s}`;
        if (allKeys.has(k)) used.add(k);
      }
    }
  }

  for (const slug of DEMO_SLUGS) {
    const k = `demo.panel.title.${slug}`;
    if (allKeys.has(k)) used.add(k);
  }

  for (const slug of SCENES_TITLE_SLUGS) {
    const k = `scenes.${slug}.title`;
    if (allKeys.has(k)) used.add(k);
  }

  // platform.flywheel.${id.toLowerCase()}Title/Desc with L1..L4
  for (const id of ["l1", "l2", "l3", "l4"]) {
    for (const s of [`${id}Title`, `${id}Desc`]) {
      const k = `platform.flywheel.${s}`;
      if (allKeys.has(k)) used.add(k);
    }
  }

  // badge.${badge} from ScenesList badgeLabelKey
  for (const b of ["live", "next", "planned", "explore"]) {
    const k = `badge.${b}`;
    if (allKeys.has(k)) used.add(k);
  }
}

function collectUsed(allKeys: Set<string>): Set<string> {
  const used = new Set<string>();
  const files = walk(SITE_SRC);

  for (const f of files) {
    if (f.endsWith(`${path.sep}i18n${path.sep}zh.ts`) || f.endsWith(`${path.sep}i18n${path.sep}en.ts`)) {
      continue;
    }
    const text = fs.readFileSync(f, "utf8");

    // Static t("key") / t('key') / t(`key`) without ${}
    for (const m of text.matchAll(/\bt\(\s*(['"`])([^'"`$\\]+)\1\s*[,)]/g)) {
      if (allKeys.has(m[2])) used.add(m[2]);
    }

    // Any other quoted string that exactly matches a dict key
    // (titleKey / textKey / displayNameKey tables, getDeploymentDisplayName, tests)
    for (const m of text.matchAll(/(['"`])([^'"`\n\\]+)\1/g)) {
      if (allKeys.has(m[2])) used.add(m[2]);
    }
  }

  expandKnownDynamics(used, allKeys);

  // Protect recently added concept keys
  for (const k of allKeys) {
    if (k.startsWith("scenes.concept.")) used.add(k);
  }

  return used;
}

function countUnescapedQuotes(s: string, q: string): number {
  let n = 0;
  for (let j = 0; j < s.length; j++) {
    if (s[j] === "\\") {
      j++;
      continue;
    }
    if (s[j] === q) n++;
  }
  return n;
}

function pruneFlatDictFile(filePath: string, dead: Set<string>): number {
  const src = fs.readFileSync(filePath, "utf8");
  const lines = src.split("\n");
  const remove = new Set<number>();
  let removed = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^(\s*)((?:"[^"]+"|'[^']+'|[A-Za-z_][\w]*))\s*:\s*(.*)$/);
    if (!m) {
      i++;
      continue;
    }

    let keyRaw = m[2];
    if (
      (keyRaw.startsWith('"') && keyRaw.endsWith('"')) ||
      (keyRaw.startsWith("'") && keyRaw.endsWith("'"))
    ) {
      keyRaw = keyRaw.slice(1, -1);
    }

    if (!dead.has(keyRaw)) {
      i++;
      continue;
    }

    const start = i;
    let end = i;
    let valuePart = m[3].trim();

    if (valuePart === "") {
      end = i + 1;
      while (end < lines.length && lines[end].trim() === "") end++;
      if (end < lines.length) valuePart = lines[end].trim();
    }

    const qMatch = valuePart.match(/^(['"`])/);
    if (qMatch) {
      const q = qMatch[1];
      let quotes = 0;
      for (let j = start; j <= end && j < lines.length; j++) {
        if (j === start) {
          const afterColon = lines[j].replace(/^[^:]*:\s*/, "");
          quotes += countUnescapedQuotes(afterColon, q);
        } else {
          quotes += countUnescapedQuotes(lines[j], q);
        }
      }
      while (quotes < 2 && end + 1 < lines.length) {
        end++;
        quotes += countUnescapedQuotes(lines[end], q);
      }
    }

    for (let j = start; j <= end; j++) remove.add(j);
    removed++;
    i = end + 1;
  }

  let out = lines.filter((_, idx) => !remove.has(idx));

  // Drop orphan // section comments with no following key before next blank cluster / close
  out = out.filter((line, idx, arr) => {
    const t = line.trim();
    if (!t.startsWith("//")) return true;
    for (let k = idx + 1; k < Math.min(arr.length, idx + 8); k++) {
      const n = arr[k].trim();
      if (n === "") continue;
      if (n.startsWith("//")) return true;
      if (n.startsWith("}")) return false;
      return true;
    }
    return false;
  });

  const compact: string[] = [];
  let blanks = 0;
  for (const l of out) {
    if (l.trim() === "") {
      blanks++;
      if (blanks <= 1) compact.push(l);
    } else {
      blanks = 0;
      compact.push(l);
    }
  }

  const body = compact.join("\n");
  fs.writeFileSync(filePath, body.endsWith("\n") ? body : body + "\n");
  return removed;
}

function main() {
  const zhKeys = new Set(Object.keys(zh));
  const enKeys = new Set(Object.keys(en));
  const allKeys = new Set([...zhKeys, ...enKeys]);
  const used = collectUsed(allKeys);

  const pruneList = [...zhKeys]
    .filter((k) => enKeys.has(k) && !used.has(k) && !k.startsWith("scenes.concept."))
    .sort();

  const byPrefix = new Map<string, number>();
  for (const k of pruneList) {
    const p = k.includes(".") ? k.split(".")[0] : k;
    byPrefix.set(p, (byPrefix.get(p) || 0) + 1);
  }

  const keptConsole = [...used]
    .filter((k) => k.startsWith("console.") || k.startsWith("sceneOps."))
    .sort();

  console.log("=== COUNTS ===");
  console.log({
    zh: zhKeys.size,
    en: enKeys.size,
    used: used.size,
    prune: pruneList.length,
  });
  console.log("\n=== PRUNE BY PREFIX ===");
  for (const [p, n] of [...byPrefix.entries()].sort()) console.log(`  ${p}: ${n}`);
  console.log("\n=== KEEP console/sceneOps (used) ===");
  console.log(keptConsole.join("\n") || "(none)");
  console.log("\n=== KEEP scenes.concept ===");
  console.log([...used].filter((k) => k.startsWith("scenes.concept.")).join("\n"));

  // Sanity: every static t("...") must be in used
  for (const f of walk(SITE_SRC)) {
    if (f.includes(`${path.sep}i18n${path.sep}`)) continue;
    const text = fs.readFileSync(f, "utf8");
    for (const m of text.matchAll(/\bt\(\s*(['"`])([^'"`$\\]+)\1\s*[,)]/g)) {
      if (allKeys.has(m[2]) && !used.has(m[2])) {
        throw new Error(`static t() key not in used: ${m[2]} @ ${f}`);
      }
      if (!allKeys.has(m[2])) {
        console.warn(`WARN: t() key missing from dict: ${m[2]} @ ${path.relative(ROOT, f)}`);
      }
    }
  }

  const deadPath = path.join(ROOT, "scripts/tmp-site-i18n-dead-keys.json");
  fs.writeFileSync(deadPath, JSON.stringify(pruneList, null, 2));
  console.log(`\nWrote ${deadPath} (${pruneList.length} keys)`);

  if (WRITE) {
    const zhPath = path.join(ROOT, "apps/site/src/i18n/zh.ts");
    const enPath = path.join(ROOT, "apps/site/src/i18n/en.ts");
    fs.copyFileSync(zhPath, zhPath + ".bak");
    fs.copyFileSync(enPath, enPath + ".bak");
    const deadSet = new Set(pruneList);
    const r1 = pruneFlatDictFile(zhPath, deadSet);
    const r2 = pruneFlatDictFile(enPath, deadSet);
    console.log(`\n--write removed leaves: zh=${r1} en=${r2}`);
  } else {
    console.log("\n(dry-run; pass --write to prune)");
  }
}

main();
