// Archived script: do not execute as a current repository entrypoint.
/**
 * One-shot migration: v0.3 farm model → v0.4 deployment model.
 *
 * Usage:
 *   npx tsx scripts/migrate-v0.3-farm-to-deployment.ts --dry-run
 *   npx tsx scripts/migrate-v0.3-farm-to-deployment.ts --dry-run --source /path/to/old/data
 *   npx tsx scripts/migrate-v0.3-farm-to-deployment.ts --apply --map farm-001=dep-gh-pilot-001
 *   npx tsx scripts/migrate-v0.3-farm-to-deployment.ts --apply --force
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { DEFAULT_DEPLOYMENT_ID, resolveAgentDataDir } from "@embodied-agent/platform";

type FarmMap = Map<string, string>;

const DEFAULT_FARM_MAP: FarmMap = new Map([["farm-001", DEFAULT_DEPLOYMENT_ID]]);

function parseArgs(argv: string[]) {
  let dryRun = false;
  let apply = false;
  let force = false;
  let source: string | undefined;
  const map = new Map(DEFAULT_FARM_MAP);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--apply") apply = true;
    else if (arg === "--force") force = true;
    else if (arg === "--source") source = argv[++i];
    else if (arg.startsWith("--map=")) {
      const pair = arg.slice("--map=".length);
      const eq = pair.indexOf("=");
      if (eq <= 0) throw new Error(`invalid --map: ${pair}`);
      map.set(pair.slice(0, eq), pair.slice(eq + 1));
    } else if (arg === "--map") {
      const pair = argv[++i];
      const eq = pair.indexOf("=");
      if (!pair || eq <= 0) throw new Error(`invalid --map: ${pair}`);
      map.set(pair.slice(0, eq), pair.slice(eq + 1));
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage:
  npx tsx scripts/migrate-v0.3-farm-to-deployment.ts --dry-run [--source DIR] [--map old=new]
  npx tsx scripts/migrate-v0.3-farm-to-deployment.ts --apply [--source DIR] [--map old=new] [--force]

Default map: farm-001=${DEFAULT_DEPLOYMENT_ID}
`);
      process.exit(0);
    }
  }

  if (dryRun === apply) {
    throw new Error("specify exactly one of --dry-run or --apply");
  }

  return { dryRun, apply, force, source, map };
}

function log(mode: "dry" | "apply", msg: string) {
  const prefix = mode === "dry" ? "[dry-run]" : "[apply]";
  console.log(`${prefix} ${msg}`);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path: string, data: unknown, dryRun: boolean) {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  if (dryRun) return;
  writeFileSync(path, body, "utf8");
}

function mapFarmId(value: string, map: FarmMap): string {
  return map.get(value) ?? value;
}

function migrateSettingsObject(
  raw: Record<string, unknown>,
  map: FarmMap,
): Record<string, unknown> {
  const out = { ...raw };
  if (typeof out.farm_id === "string") {
    out.deployment_id = mapFarmId(out.farm_id, map);
    delete out.farm_id;
  }
  if (typeof out.farm_name === "string") {
    out.deployment_name = out.farm_name;
    delete out.farm_name;
  }
  return out;
}

function migrateRegistryObject(
  raw: Record<string, unknown>,
  map: FarmMap,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };

  if (Array.isArray(out.farms)) {
    out.deployments = (out.farms as Array<Record<string, unknown>>).map((f) => {
      const item = { ...f };
      if (typeof item.farm_id === "string") {
        item.deployment_id = mapFarmId(item.farm_id, map);
        delete item.farm_id;
      }
      return item;
    });
    delete out.farms;
  }

  for (const key of ["deployments", "greenhouses", "nodes", "devices"] as const) {
    const arr = out[key];
    if (!Array.isArray(arr)) continue;
    out[key] = arr.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      const item = { ...(entry as Record<string, unknown>) };
      if (typeof item.farm_id === "string") {
        item.deployment_id = mapFarmId(item.farm_id, map);
        delete item.farm_id;
      }
      return item;
    });
  }

  return out;
}

function migrateJsonlLine(line: string, map: FarmMap): string {
  const trimmed = line.trim();
  if (!trimmed) return line;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    let changed = false;
    if (typeof obj.farm_id === "string") {
      obj.deployment_id = mapFarmId(obj.farm_id, map);
      delete obj.farm_id;
      changed = true;
    }
    if (typeof obj.farm_name === "string") {
      obj.deployment_name = obj.farm_name;
      delete obj.farm_name;
      changed = true;
    }
    return changed ? JSON.stringify(obj) : line.replace(/\r?\n$/, "");
  } catch {
    return line.replace(/\r?\n$/, "");
  }
}

function migrateJsonlFile(path: string, map: FarmMap, dryRun: boolean) {
  const raw = readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/);
  const migrated = lines.map((line, idx) => {
    const out = migrateJsonlLine(line, map);
    return idx < lines.length - 1 || raw.endsWith("\n") ? `${out}\n` : out;
  });
  const body = migrated.join("").replace(/\n$/, raw.endsWith("\n") ? "\n" : "");
  if (!dryRun && body !== raw) writeFileSync(path, body, "utf8");
}

function migrateDeploymentDirContents(dir: string, map: FarmMap, dryRun: boolean) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name.endsWith(".jsonl")) {
      log(dryRun ? "dry" : "apply", `jsonl fields: ${path}`);
      migrateJsonlFile(path, map, dryRun);
    }
  }
}

function migrateSettings(dataRoot: string, map: FarmMap, dryRun: boolean) {
  const path = join(dataRoot, "settings.json");
  if (!existsSync(path)) {
    log(dryRun ? "dry" : "apply", "skip settings.json (missing)");
    return;
  }
  const raw = readJson(path) as Record<string, unknown>;
  if (!raw.farm_id && !raw.farm_name) {
    log(dryRun ? "dry" : "apply", "settings.json already migrated");
    return;
  }
  const migrated = migrateSettingsObject(raw, map);
  log(dryRun ? "dry" : "apply", `settings.json: farm_id/farm_name → deployment_id/deployment_name`);
  writeJson(path, migrated, dryRun);
}

function migrateUsers(dataRoot: string, map: FarmMap, dryRun: boolean) {
  const path = join(dataRoot, "users.json");
  if (!existsSync(path)) {
    log(dryRun ? "dry" : "apply", "skip users.json (missing)");
    return;
  }
  const raw = readJson(path) as Record<string, Record<string, unknown>>;
  let changed = false;
  const migrated: Record<string, Record<string, unknown>> = {};
  for (const [userId, user] of Object.entries(raw)) {
    if (!user || typeof user !== "object") {
      migrated[userId] = user;
      continue;
    }
    const item = { ...user };
    if (typeof item.farm_id === "string") {
      item.deployment_id = mapFarmId(item.farm_id, map);
      delete item.farm_id;
      changed = true;
    }
    migrated[userId] = item;
  }
  if (!changed) {
    log(dryRun ? "dry" : "apply", "users.json already migrated");
    return;
  }
  log(dryRun ? "dry" : "apply", "users.json: farm_id → deployment_id");
  writeJson(path, migrated, dryRun);
}

function migrateRegistry(dataRoot: string, map: FarmMap, dryRun: boolean) {
  const path = join(dataRoot, "device-registry.json");
  if (!existsSync(path)) {
    log(dryRun ? "dry" : "apply", "skip device-registry.json (missing)");
    return;
  }
  const raw = readJson(path) as Record<string, unknown>;
  const hasLegacy =
    Array.isArray(raw.farms) ||
    [raw.greenhouses, raw.nodes, raw.devices].some(
      (arr) =>
        Array.isArray(arr) &&
        arr.some((e) => e && typeof e === "object" && "farm_id" in (e as object)),
    );
  if (!hasLegacy) {
    log(dryRun ? "dry" : "apply", "device-registry.json already migrated");
    return;
  }
  const migrated = migrateRegistryObject(raw, map);
  log(
    dryRun ? "dry" : "apply",
    "device-registry.json: farms[] → deployments[], farm_id → deployment_id",
  );
  writeJson(path, migrated, dryRun);
}

function migrateFarmDirs(dataRoot: string, map: FarmMap, dryRun: boolean, force: boolean) {
  const farmsDir = join(dataRoot, "farms");
  const deploymentsDir = join(dataRoot, "deployments");

  if (!existsSync(farmsDir)) {
    log(dryRun ? "dry" : "apply", "no farms/ directory");
    return;
  }

  const farmIds = readdirSync(farmsDir).filter((name) =>
    statSync(join(farmsDir, name)).isDirectory(),
  );

  if (farmIds.length === 0) {
    log(dryRun ? "dry" : "apply", "farms/ is empty");
    if (!dryRun) rmdirSync(farmsDir);
    return;
  }

  if (existsSync(deploymentsDir)) {
    const existing = readdirSync(deploymentsDir);
    if (existing.length > 0 && !force) {
      throw new Error(
        `deployments/ already exists (${existing.join(", ")}); use --force to continue`,
      );
    }
  } else if (!dryRun) {
    mkdirSync(deploymentsDir, { recursive: true });
  }

  for (const farmId of farmIds) {
    const src = join(farmsDir, farmId);
    const deploymentId = mapFarmId(farmId, map);
    const dest = join(deploymentsDir, deploymentId);
    if (existsSync(dest) && !force) {
      throw new Error(`target already exists: ${dest} (use --force)`);
    }
    log(dryRun ? "dry" : "apply", `rename farms/${farmId}/ → deployments/${deploymentId}/`);
    if (!dryRun) {
      renameSync(src, dest);
      migrateDeploymentDirContents(dest, map, dryRun);
    }
  }

  if (!dryRun && existsSync(farmsDir) && readdirSync(farmsDir).length === 0) {
    rmdirSync(farmsDir);
  }
}

function main() {
  const { dryRun, force, source, map } = parseArgs(process.argv.slice(2));
  const dataRoot = resolve(source ?? resolveAgentDataDir());
  const mode = dryRun ? "dry" : "apply";

  console.log(`[migrate] source=${dataRoot}`);
  console.log(`[migrate] map=${[...map.entries()].map(([k, v]) => `${k}→${v}`).join(", ")}`);

  migrateFarmDirs(dataRoot, map, dryRun, force);
  migrateSettings(dataRoot, map, dryRun);
  migrateUsers(dataRoot, map, dryRun);
  migrateRegistry(dataRoot, map, dryRun);

  log(mode, "done");
}

main();
