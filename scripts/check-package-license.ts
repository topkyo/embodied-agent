import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

type WorkspaceManifest = {
  workspaces?: string[];
};

type PackageManifest = {
  license?: string;
  private?: boolean;
};

function listWorkspacePackageJsonPaths(): string[] {
  const rootManifest = JSON.parse(
    readFileSync(join(ROOT, "package.json"), "utf8"),
  ) as WorkspaceManifest;
  const patterns = rootManifest.workspaces ?? [];
  const paths: string[] = [];

  for (const pattern of patterns) {
    const match = pattern.match(/^([^/]+)\/\*$/);
    if (!match) {
      console.error(`[package-license] unsupported workspace pattern: ${pattern}`);
      process.exit(1);
    }
    const parent = match[1]!;
    const parentDir = join(ROOT, parent);
    if (!existsSync(parentDir)) continue;

    for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkgPath = join(parentDir, entry.name, "package.json");
      if (existsSync(pkgPath)) paths.push(pkgPath);
    }
  }

  return paths.sort();
}

const offenders: string[] = [];

for (const pkgPath of listWorkspacePackageJsonPaths()) {
  const rel = pkgPath.slice(ROOT.length + 1);
  const manifest = JSON.parse(readFileSync(pkgPath, "utf8")) as PackageManifest;

  if (manifest.license !== "MIT") {
    offenders.push(`${rel}: license must be "MIT" (got ${JSON.stringify(manifest.license ?? null)})`);
  }
  if (manifest.private !== true) {
    offenders.push(`${rel}: private must be true (got ${JSON.stringify(manifest.private ?? null)})`);
  }
}

if (offenders.length > 0) {
  console.error("[package-license] workspace package.json gate failed:");
  for (const line of offenders) console.error(`- ${line}`);
  process.exit(1);
}
