import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const ONE_MB = 1024 * 1024;
const ALLOWED_LARGE_FILE = "docs/design/web-rebuild-v3/greenhouse-scene-desktop.png";

const FORBIDDEN_PREFIXES = [
  "docs/pilot/",
  "docs/strategy/",
  "docs/audits/",
  "docs/analysis/",
  "docs/plans/",
  "docs/archive/plans/",
  "docs/archive/releases/",
  "docs/archive/web-ux-vision-2026-07",
  "deploy/vps/",
];

const FORBIDDEN_EXACT = new Set([".github/workflows/deploy-vps.yml", ".github/dependabot.yml"]);

const SKIP_CONTENT_SCAN = new Set([
  "scripts/check-public-snapshot.ts",
  "scripts/sanitize-public-snapshot.ts",
  "scripts/publish-public-snapshot.sh",
]);

const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "openai-sk-key", pattern: /sk-[A-Za-z0-9]{20,}/ },
  { name: "aws-access-key", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "private-key-pem", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "appsecret", pattern: /appsecret/i },
];

const INSTANCE_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "home-tim", pattern: /\/home\/tim\b/ },
  { name: "ssh-alias-goyun", pattern: /\bgoyun\b/ },
  { name: "vps-public-ip", pattern: /91\.216\.169\.29/ },
  { name: "ea-web-9527", pattern: /ea-web-9527/ },
  { name: "ea-site-9527", pattern: /ea-site-9527/ },
  { name: "vercel-team-scope", pattern: /team_vZF69jAbikZqLi7whDRvrSx3/ },
  {
    name: "trycloudflare-instance",
    pattern: /https?:\/\/(?!your-tunnel-url\.)[a-z0-9-]+\.trycloudflare\.com/i,
  },
  { name: "ssh-host-key", pattern: /ssh-(?:ed25519|rsa) AAAA[A-Za-z0-9+/]+/ },
];

const GITIGNORE_REQUIRED = [".env", ".agentstack/", "infra/mosquitto/certs/"];

function gitLsFiles(): string[] {
  const result = spawnSync("git", ["ls-files"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(result.stderr || `git ls-files failed with status ${result.status ?? 1}`);
  }
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function isBinaryBuffer(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 8192));
  return sample.includes(0);
}

function isTextScannable(relPath: string, size: number): boolean {
  if (relPath === ALLOWED_LARGE_FILE) return false;
  if (size > ONE_MB) return false;
  return true;
}

const failures: string[] = [];
const tracked = gitLsFiles();

for (const rel of tracked) {
  if (FORBIDDEN_EXACT.has(rel)) {
    failures.push(`forbidden-path: ${rel}`);
    continue;
  }
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (rel === prefix.slice(0, -1) || rel.startsWith(prefix)) {
      failures.push(`forbidden-prefix (${prefix}): ${rel}`);
      break;
    }
  }
}

for (const rel of tracked) {
  const abs = join(ROOT, rel);
  const size = statSync(abs).size;
  if (size > ONE_MB && rel !== ALLOWED_LARGE_FILE) {
    failures.push(`large-file (>1MB, only ${ALLOWED_LARGE_FILE} allowed): ${rel}`);
  }
}

for (const rel of tracked) {
  if (SKIP_CONTENT_SCAN.has(rel)) continue;
  const abs = join(ROOT, rel);
  if (statSync(abs).isDirectory()) continue;
  const size = statSync(abs).size;
  if (!isTextScannable(rel, size)) continue;

  const buf = readFileSync(abs);
  if (isBinaryBuffer(buf)) continue;

  const text = buf.toString("utf8");
  for (const rule of SECRET_PATTERNS) {
    if (rule.pattern.test(text)) {
      failures.push(`secret-pattern (${rule.name}): ${rel}`);
    }
  }
  for (const rule of INSTANCE_PATTERNS) {
    if (rule.pattern.test(text)) {
      failures.push(`instance-pattern (${rule.name}): ${rel}`);
    }
  }
}

const gitignorePath = join(ROOT, ".gitignore");
const gitignoreText = readFileSync(gitignorePath, "utf8");
for (const required of GITIGNORE_REQUIRED) {
  if (!gitignoreText.includes(required)) {
    failures.push(`.gitignore missing required entry: ${required}`);
  }
}

if (failures.length > 0) {
  console.error("[public-snapshot] public snapshot gate failed:");
  for (const line of failures) console.error(`- ${line}`);
  process.exit(1);
}
