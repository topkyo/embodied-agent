import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DOMAIN_PACK_CATALOG as WEB_DOMAIN_PACK_CATALOG } from "../apps/web/src/lib/domain-packs.ts";
import { DOMAIN_PACK_CATALOG as SITE_DOMAIN_PACK_CATALOG } from "../apps/site/src/lib/domain-packs.ts";

type RuntimeCatalogEntry = {
  id: string;
  webSlug: string;
  status: "live" | "placeholder";
};

const root = resolve(import.meta.dirname, "..");
const runtime = JSON.parse(readFileSync(resolve(root, "domain-packs.json"), "utf8")) as {
  packs?: RuntimeCatalogEntry[];
};

const runtimePacks = runtime.packs ?? [];
const runtimeById = new Map(runtimePacks.map((pack) => [pack.id, pack]));

function checkCatalog(label: string, catalog: typeof WEB_DOMAIN_PACK_CATALOG): string[] {
  const failures: string[] = [];
  const webRuntimePacks = catalog.filter((pack) => "packId" in pack);
  const webById = new Map(webRuntimePacks.map((pack) => [pack.packId, pack]));

  for (const pack of runtimePacks) {
    const web = webById.get(pack.id);
    if (!web) {
      failures.push(`${label} catalog missing runtime pack ${pack.id}`);
      continue;
    }
    if (web.slug !== pack.webSlug) {
      failures.push(
        `${label} catalog slug mismatch for ${pack.id}: ${web.slug} != ${pack.webSlug}`,
      );
    }
    if (web.runtimeStatus !== pack.status) {
      failures.push(
        `${label} catalog runtimeStatus mismatch for ${pack.id}: ${web.runtimeStatus} != ${pack.status}`,
      );
    }
    if (pack.status === "live" && !web.opsEnabled) {
      failures.push(`${label} catalog live pack ${pack.id} must have opsEnabled=true`);
    }
    if (pack.status === "placeholder" && web.opsEnabled) {
      failures.push(`${label} catalog placeholder pack ${pack.id} must not enable ops`);
    }
    if (!web.scenePath.startsWith("/scenes/")) {
      failures.push(`${label} catalog scenePath must be marketing route for ${pack.id}`);
    }
  }

  for (const web of webRuntimePacks) {
    if (!runtimeById.has(web.packId)) {
      failures.push(`${label} catalog pack ${web.packId} is missing from domain-packs.json`);
    }
  }

  return failures;
}

const failures = [
  ...checkCatalog("Web", WEB_DOMAIN_PACK_CATALOG),
  ...checkCatalog("Site", SITE_DOMAIN_PACK_CATALOG),
];

if (failures.length > 0) {
  console.error("[check-web-domain-catalog] drift detected:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
