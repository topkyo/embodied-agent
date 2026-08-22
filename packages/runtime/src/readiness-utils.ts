import type { DomainPackReadinessIssue } from "@embodied-agent/core";
import { readFileSync } from "node:fs";

export function issue(
  code: string,
  message: string,
  severity: DomainPackReadinessIssue["severity"] = "error",
): DomainPackReadinessIssue {
  return { code, message, severity };
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function pushIf(
  issues: DomainPackReadinessIssue[],
  condition: boolean,
  code: string,
  message: string,
  severity: DomainPackReadinessIssue["severity"] = "error",
): void {
  if (!condition) return;
  issues.push({ code, message, severity });
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function numberField(obj: Record<string, unknown>, field: string): number | undefined {
  const value = obj[field];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
