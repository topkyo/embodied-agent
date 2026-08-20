import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { deploymentScopedPath } from "../fs/deployment-path.js";

function collectionFile(collection: string): string {
  const name = collection.trim();
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
    throw new Error(`invalid_domain_data_collection: ${collection}`);
  }
  return `domain-pack-data/${name}.jsonl`;
}

export function appendDomainDataRow<T extends Record<string, unknown>>(
  deploymentId: string,
  collection: string,
  row: T,
): T {
  const path = deploymentScopedPath(collectionFile(collection), deploymentId);
  const dir = path.slice(0, path.lastIndexOf("/"));
  mkdirSync(dir, { recursive: true });
  appendFileSync(path, `${JSON.stringify(row)}\n`);
  return row;
}

export function listDomainDataRows<T = Record<string, unknown>>(
  deploymentId: string,
  collection: string,
): T[] {
  const path = deploymentScopedPath(collectionFile(collection), deploymentId);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });
}
