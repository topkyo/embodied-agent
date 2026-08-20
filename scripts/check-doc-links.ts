import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const result = spawnSync("git", ["ls-files", "*.md"], {
  cwd: ROOT,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (result.error) throw result.error;
if ((result.status ?? 1) !== 0) {
  throw new Error(result.stderr || `git ls-files failed with status ${result.status ?? 1}`);
}

const files = result.stdout.split(/\r?\n/).filter(Boolean);

// Inline links plus reference-style definitions; bare autolinks carry no repo-relative paths.
const LINK_PATTERN = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)|^\[[^\]]+\]:\s*(\S+)/gm;
const EXTERNAL_PREFIX = /^(?:https?:|mailto:|tel:|data:|#)/;

const failures: string[] = [];

for (const file of files) {
  const abs = join(ROOT, file);
  // Index may still list files deleted from the worktree but not yet staged.
  if (!existsSync(abs)) continue;
  const text = await readFile(abs, "utf8");
  const seen = new Set<string>();

  for (const match of text.matchAll(LINK_PATTERN)) {
    const raw = match[1] ?? match[2];
    if (!raw || EXTERNAL_PREFIX.test(raw)) continue;

    const withoutAnchor = raw.split("#")[0]?.split("?")[0];
    if (!withoutAnchor) continue;

    let target: string;
    try {
      target = decodeURIComponent(withoutAnchor);
    } catch {
      target = withoutAnchor;
    }

    const key = target;
    if (seen.has(key)) continue;
    seen.add(key);

    const resolved = target.startsWith("/")
      ? join(ROOT, target.slice(1))
      : resolve(dirname(abs), target);

    if (!existsSync(resolved)) {
      failures.push(`${file}: broken link -> ${raw}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`[check-doc-links] ${failures.length} broken link(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[check-doc-links] ok (${files.length} markdown files)`);
