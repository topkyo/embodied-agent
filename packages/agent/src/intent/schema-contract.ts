/**
 * Canonical JSON contract hints for LLM + one-shot schema repair.
 * Edit INTENT_SCHEMA_CHEATSHEET_SOURCE then run `npm run codegen:intent`.
 * Runtime reads generated/intent-cheatsheet.ts.
 */
import { INTENT_SCHEMA_CHEATSHEET } from "./generated/intent-cheatsheet.js";
import { escapeUserUtteranceMarkers } from "./prompt.js";

export { INTENT_SCHEMA_CHEATSHEET };

/** Fallback only. Runtime prompt/repair contracts must come from the active Domain Pack. */
export const INTENT_SCHEMA_CHEATSHEET_SOURCE = `当前 active_domain 的 Domain Pack 必须提供 intentContract。`;

export function buildSchemaRepairUserMessage(opts: {
  originalUtterance: string;
  invalidJson: unknown;
  zodError: string;
  intentContract?: string;
}): string {
  const contract = opts.intentContract?.trim();
  if (!contract) {
    throw new Error("active Domain Pack 缺少 intentContract。");
  }
  return [
    `用户原话：${escapeUserUtteranceMarkers(opts.originalUtterance)}`,
    `你上一次输出的 JSON 未通过校验，错误：${opts.zodError}`,
    `无效输出：${JSON.stringify(opts.invalidJson)}`,
    "请仅输出修正后的 JSON（不要 markdown），严格符合下列契约：",
    contract,
  ].join("\n\n");
}
