import { spawnSync } from "node:child_process";

const forbiddenPrefixes = ["api/", "data/", "dogfood-output/", "e2e/"];
const forbiddenSuffixes = [".tsbuildinfo", ".DS_Store"];
const allowed = new Set<string>();

const result = spawnSync("git", ["ls-files"], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

if (result.error) throw result.error;
if ((result.status ?? 1) !== 0) {
  throw new Error(result.stderr || `git ls-files failed with status ${result.status ?? 1}`);
}

const files = result.stdout.split(/\r?\n/).filter(Boolean);
const violations = files.filter((file) => {
  if (allowed.has(file)) return false;
  return (
    forbiddenPrefixes.some((prefix) => file.startsWith(prefix)) ||
    forbiddenSuffixes.some((suffix) => file.endsWith(suffix))
  );
});

if (violations.length > 0) {
  console.error("Repo layout gate failed. Move generated/runtime or misplaced files:");
  for (const file of violations) console.error(`- ${file}`);
  process.exit(1);
}
