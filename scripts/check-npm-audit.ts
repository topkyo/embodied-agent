import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ALLOWLIST_PATH = resolve("scripts/fixtures/audit-allowlist.json");

type AuditVia =
  | string
  | {
      url?: string;
      title?: string;
      severity?: string;
      name?: string;
    };

type AuditVulnerability = {
  name?: string;
  severity?: string;
  via?: AuditVia[];
};

type AuditReport = {
  vulnerabilities?: Record<string, AuditVulnerability>;
};

type AllowlistFile = {
  allowlist: string[];
};

function loadAllowlist(): Set<string> {
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8")) as AllowlistFile;
  if (!Array.isArray(raw.allowlist) || raw.allowlist.length === 0) {
    throw new Error(`${ALLOWLIST_PATH} must contain a non-empty allowlist array`);
  }
  return new Set(raw.allowlist.map((id) => id.toUpperCase()));
}

function runAuditJson(): AuditReport {
  let stdout: string;
  try {
    stdout = execSync("npm audit --json", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const err = error as { stdout?: string };
    stdout = err.stdout ?? "";
    if (!stdout.trim()) {
      throw new Error(`npm audit --json failed without JSON output: ${String(error)}`, { cause: error });
    }
  }
  return JSON.parse(stdout) as AuditReport;
}

function ghsaFromUrl(url: string): string | null {
  const match = url.match(/GHSA-[a-z0-9-]+/i);
  return match ? match[0]!.toUpperCase() : null;
}

function collectAdvisories(
  report: AuditReport,
): Map<string, { severity: string; packages: Set<string> }> {
  const advisories = new Map<string, { severity: string; packages: Set<string> }>();
  for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
    const severity = vuln.severity ?? "unknown";
    if (severity !== "high" && severity !== "critical") continue;
    for (const via of vuln.via ?? []) {
      if (typeof via === "string") continue;
      const id = via.url ? ghsaFromUrl(via.url) : null;
      if (!id) continue;
      const existing = advisories.get(id) ?? { severity, packages: new Set<string>() };
      existing.packages.add(pkg);
      if (severity === "critical") existing.severity = "critical";
      advisories.set(id, existing);
    }
  }
  return advisories;
}

function main(): void {
  const allowlist = loadAllowlist();
  const advisories = collectAdvisories(runAuditJson());
  const unlisted: { id: string; severity: string; packages: string[] }[] = [];

  for (const [id, meta] of advisories) {
    if (!allowlist.has(id)) {
      unlisted.push({
        id,
        severity: meta.severity,
        packages: [...meta.packages].sort(),
      });
    }
  }

  const stale = [...allowlist].filter((id) => !advisories.has(id)).sort();

  if (unlisted.length === 0) {
    console.log(
      `[npm-audit] OK: ${advisories.size} high/critical advisories, all allowlisted (${allowlist.size} entries)`,
    );
    if (stale.length > 0) {
      console.warn(`[npm-audit] stale allowlist entries (${stale.length}): ${stale.join(", ")}`);
    }
    return;
  }

  console.error("[npm-audit] unallowlisted high/critical advisories:");
  for (const row of unlisted.sort((a, b) => a.id.localeCompare(b.id))) {
    console.error(`  - ${row.id} (${row.severity}) via ${row.packages.join(", ")}`);
  }
  console.error(
    `[npm-audit] add reviewed exceptions to ${ALLOWLIST_PATH} or upgrade dependencies to remediate`,
  );
  process.exit(1);
}

main();
