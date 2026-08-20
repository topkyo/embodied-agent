/**
 * 门禁：web-dogfood 中鉴权/禁用壳关键用例 title 必须含 @critical，
 * 防止 CI 注释声称会跑而实际零 tag 的假绿再次出现。
 *
 * 真源：docs/archive/plans/2026-07-09-web-test-infra-port-assessment.zh.md §6.1
 * + 门禁诚实性 2.0（role-switch 纳入强制清单）
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dogfoodPath = resolve(root, "tests/e2e/web-dogfood.spec.ts");
const text = readFileSync(dogfoodPath, "utf8");

/** 必须带 @critical 的用例 title（与 test("…") 精确对齐，含 tag） */
const REQUIRED_CRITICAL_TITLES = [
  "user session hides admin nav items @critical",
  "role switch user then admin does not leak user denial @critical",
  "platform base denies access without admin session @critical",
  "platform base shows readiness with admin session @critical",
  "greenhouse review denies access without admin session @critical",
  "placeholder pack ops shows disabled shell @critical",
  "inactive live pack ops shows disabled shell @critical",
] as const;

const failures: string[] = [];

for (const title of REQUIRED_CRITICAL_TITLES) {
  const needle = `test("${title}"`;
  if (!text.includes(needle)) {
    failures.push(`missing critical test title: ${title}`);
  }
}

if (failures.length > 0) {
  console.error("check-web-dogfood-critical FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error("\nAdd @critical to these titles in tests/e2e/web-dogfood.spec.ts (PR gate).");
  process.exit(1);
}

console.log(`check-web-dogfood-critical OK (${REQUIRED_CRITICAL_TITLES.length} titles)`);
